import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { startResourceApplication } from "../support/resource-application.js";

test("PR1 forward migration retains legacy inquiry/reply/link/delivery bytes and rejects lossy round rollback", async (t) => {
  const { db } = await startResourceApplication(t);
  const q = db.createQueryRunner();
  await q.connect();
  await q.startTransaction();
  try {
    const schema = `pr1_${randomUUID().replaceAll("-", "")}`;
    await q.query(`CREATE SCHEMA ${schema}`);
    await q.query(`SET LOCAL search_path TO ${schema}`);
    const migrations = [...db.migrations].sort((a, b) =>
      a.constructor.name
        .slice(-13)
        .localeCompare(b.constructor.name.slice(-13)),
    );
    for (const m of migrations) {
      if (m.constructor.name.startsWith("EventCreationRetry")) break;
      await m.up(q);
    }
    const account = randomUUID(),
      event = randomUUID(),
      restaurant = randomUUID(),
      request = randomUUID(),
      target = randomUUID(),
      contact = randomUUID();
    await q.query(
      `INSERT INTO accounts(id,email,"passwordHash","createdAt") VALUES($1,'legacy@example.test','hash',now())`,
      [account],
    );
    await q.query(
      "INSERT INTO events(id,owner_id,name,created_at) VALUES($1,$2,'기존 행사',now())",
      [event, account],
    );
    await q.query(
      "INSERT INTO restaurants(id,name,address,region) VALUES($1,'과거 매장','과거 주소','지역')",
      [restaurant],
    );
    await q.query(
      `INSERT INTO reservation_requests(id,event_id,request_key,digest,snapshot,contact_name,contact_phone,created_at) VALUES($1,$2,$3,$4,'{"expectedGuests":24,"startsAt":"2099-01-01T12:00:00.000Z"}','당시 총무','01000001234',now())`,
      [request, event, randomUUID(), "a".repeat(64)],
    );
    await q.query(
      "INSERT INTO reservation_request_targets(id,request_id,restaurant_id,restaurant_name,address,is_demo,contact_id,contact_name,contact_phone,consent_at,reply_version,delivery_status) VALUES($1,$2,$3,'당시 매장','당시 주소',true,$4,'당시 담당','01000005678',now(),1,'DELIVERED')",
      [target, request, restaurant, contact],
    );
    await q.query(
      `INSERT INTO merchant_reply_revisions(id,target_id,revision,request_key,digest,kind,snapshot,reason,actor,created_at) VALUES($1,$2,1,$3,$4,'DECLINE','{"requested":{"expectedGuests":24},"offered":null}','과거 불가 사유','{"kind":"OPERATOR_RECORDED","id":"migration-test"}',now())`,
      [randomUUID(), target, randomUUID(), "b".repeat(64)],
    );
    await q.query(
      "INSERT INTO merchant_reply_links(target_id,contact_id,phone_snapshot,digest,expires_at) VALUES($1,$2,'01000005678',$3,now()+interval '1 day')",
      [target, contact, "c".repeat(64)],
    );
    await q.query(
      `INSERT INTO message_deliveries(id,target_id,contact_id,phone_snapshot,variables,status,provider,provider_message_id,created_at,updated_at) VALUES($1,$2,$3,'01000005678','{"eventName":"과거 행사"}','DELIVERED','fake','legacy-delivery',now(),now())`,
      [randomUUID(), target, contact],
    );
    const beforeDelivery = await q.query("SELECT * FROM message_deliveries");
    const legacy = await q.query(
      "SELECT to_jsonb(r) AS request,to_jsonb(t) AS target,to_jsonb(p) AS reply,to_jsonb(l) AS link FROM reservation_requests r,reservation_request_targets t,merchant_reply_revisions p,merchant_reply_links l",
    );
    const foundation = migrations.find((m) =>
      m.constructor.name.startsWith("EventCreationRetry"),
    )!;
    const selection = migrations.find((m) =>
      m.constructor.name.startsWith("ReservationSelection"),
    )!;
    await foundation.up(q);
    await selection.up(q);
    assert.deepEqual(
      await q.query("SELECT * FROM message_deliveries"),
      beforeDelivery,
    );
    const [upgraded] = await q.query(
      "SELECT to_jsonb(r) AS request,to_jsonb(t) AS target,to_jsonb(p) AS reply,to_jsonb(l) AS link FROM reservation_requests r,reservation_request_targets t,merchant_reply_revisions p,merchant_reply_links l",
    );
    for (const key of ["request", "target"] as const)
      for (const field of Object.keys(legacy[0][key]))
        assert.deepEqual(
          upgraded[key][field],
          legacy[0][key][field],
          `${key}.${field}`,
        );
    assert.deepEqual(upgraded.reply, legacy[0].reply);
    assert.deepEqual(upgraded.link, legacy[0].link);
    assert.equal(upgraded.request.round, 1);
    assert.equal(upgraded.request.created_by_id, null);
    assert.equal(upgraded.request.current_contact_account_id, account);
    assert.equal(upgraded.target.candidate_state, "OPEN");
    assert.equal(upgraded.target.delivery_status, "DELIVERED");
    assert.equal(
      (
        await q.query(
          "SELECT count(*)::int AS count FROM selected_reservations",
        )
      )[0].count,
      0,
    );
    const recipientMigration = migrations.find((m) =>
      m.constructor.name.startsWith("NotificationRecipientSnapshot"),
    )!;
    await recipientMigration.up(q);
    await recipientMigration.down(q);
    await recipientMigration.up(q);
    const fact = randomUUID(),
      message = randomUUID();
    await q.query(
      "INSERT INTO notification_facts(event_key,kind,event_id,request_id,revision,occurred_at) VALUES($1,'STORE_SELECTED',$2,$3,1,now())",
      [fact, event, request],
    );
    await q.query(
      "INSERT INTO notification_messages(id,event_key,recipient_key,phone_snapshot,text,updated_at) VALUES($1,$2,'merchant:legacy','01000005678','legacy',now())",
      [message, fact],
    );
    assert.equal(
      (
        await q.query(
          "SELECT contact_id_snapshot FROM notification_messages WHERE id=$1",
          [message],
        )
      )[0].contact_id_snapshot,
      null,
    );
    await q.query(
      "UPDATE notification_messages SET contact_id_snapshot=$1 WHERE id=$2",
      [contact, message],
    );
    await assert.rejects(recipientMigration.down(q), /forward recovery/);
    const sms = migrations.find((m) =>
      m.constructor.name.startsWith("ReservationSmsPolicy"),
    )!;
    const waiting = randomUUID();
    await q.query(
      `INSERT INTO message_deliveries
      (id,target_id,purpose,contact_id,phone_snapshot,variables,created_at,updated_at)
      VALUES($1,$2,'PENDING_TEST',$3,'01000005678','{}',now(),now())`,
      [waiting, target, contact],
    );
    await q.query(
      "UPDATE notification_messages SET status = 'DELIVERED' WHERE id=$1",
      [message],
    );
    await sms.up(q);
    assert.deepEqual(
      await q.query(
        "SELECT status, channel FROM message_deliveries ORDER BY status",
      ),
      [
        { status: "DELIVERED", channel: "LMS" },
        { status: "PENDING", channel: null },
      ],
    );
    assert.equal(
      (
        await q.query("SELECT channel FROM notification_messages WHERE id=$1", [
          message,
        ])
      )[0].channel,
      "LMS",
    );
    await sms.down(q);
    await q.query("DELETE FROM message_deliveries WHERE id=$1", [waiting]);
    await q.query("DELETE FROM notification_messages WHERE id=$1", [message]);
    await q.query("DELETE FROM notification_facts WHERE event_key=$1", [fact]);
    await q.query("SAVEPOINT pr2_upgrade");
    const reservation = randomUUID();
    await q.query(
      "INSERT INTO selected_reservations(id,event_id,request_id,target_id,revision,snapshot,selected_by,selected_at) VALUES($1,$2,$3,$4,1,$5::jsonb,$6,now())",
      [
        reservation,
        event,
        request,
        target,
        JSON.stringify({
          offered: { deposit: { kind: "UNKNOWN", amount: null } },
          requested: { expectedGuests: 24 },
        }),
        account,
      ],
    );
    const beforeSelected = await q.query("SELECT * FROM selected_reservations");
    const { ReservationCompletion1795755600000 } =
      await import("../../src/database/migrations/1795755600000-ReservationCompletion.js");
    const completion = new ReservationCompletion1795755600000();
    await completion.up(q);
    assert.deepEqual(
      await q.query("SELECT * FROM selected_reservations"),
      beforeSelected,
    );
    assert.deepEqual(await q.query("SELECT * FROM reservation_progress"), []);
    await completion.down(q);
    await completion.up(q);
    await q.query(
      "INSERT INTO reservation_progress(reservation_id,state) VALUES($1,'{}')",
      [reservation],
    );
    await assert.rejects(completion.down(q), /forward recovery/);
    assert.deepEqual(
      await q.query("SELECT * FROM selected_reservations"),
      beforeSelected,
    );
    await q.query("ROLLBACK TO SAVEPOINT pr2_upgrade");
    await selection.down(q);
    await selection.up(q);
    await q.query(
      "UPDATE reservation_requests SET state='CLOSED',closed_at=now() WHERE id=$1",
      [request],
    );
    await q.query(
      "INSERT INTO reservation_requests(id,event_id,round,request_key,digest,snapshot,contact_name,contact_phone,created_at) SELECT $1,event_id,2,$2,digest,snapshot,contact_name,contact_phone,now() FROM reservation_requests WHERE id=$3",
      [randomUUID(), randomUUID(), request],
    );
    await assert.rejects(selection.down(q), /forward recovery/);
    assert.equal(
      (
        await q.query("SELECT count(*)::int AS count FROM reservation_requests")
      )[0].count,
      2,
    );
    await q.query(
      "UPDATE events SET creation_key=$1,creation_digest=$2 WHERE id=$3",
      [randomUUID(), "d".repeat(64), event],
    );
    await assert.rejects(foundation.down(q), /receipts must be preserved/);
  } finally {
    await q.rollbackTransaction();
    await q.release();
  }
});
