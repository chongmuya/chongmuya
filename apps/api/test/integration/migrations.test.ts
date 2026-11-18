import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { startTestApplication } from "../support/test-application.js";
import { DatabaseService } from "../../src/database/database.service.js";

test("migrations preserve existing account, group, event and session records and refuse lossy rollback", async (t) => {
  assert(process.env.TEST_DATABASE_URL);
  const { app } = await startTestApplication(process.env.TEST_DATABASE_URL);
  t.after(() => app.close());
  const db = await app.get(DatabaseService).connect();
  const runner = db.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    // A fresh transaction-local schema exercises the real migration SQL without
    // reverting migrations or modifying any existing account in the test DB.
    const schema = `upgrade_${randomUUID().replaceAll("-", "")}`;
    await runner.query(`CREATE SCHEMA ${schema}`);
    await runner.query(`SET LOCAL search_path TO ${schema}`);
    const { Authentication1793318400000 } =
      await import("../../src/database/migrations/1793318400000-Authentication.js");
    const { GroupEvents1793664000000 } =
      await import("../../src/database/migrations/1793664000000-GroupEvents.js");
    await new Authentication1793318400000().up(runner);
    const account = randomUUID(),
      session = randomUUID();
    await runner.query("INSERT INTO accounts VALUES ($1, $2, $3, now())", [
      account,
      "existing@example.com",
      "existing-hash",
    ]);
    await runner.query(
      "INSERT INTO auth_sessions VALUES ($1, $2, now() + interval '1 day', null)",
      [session, account],
    );
    await runner.query("INSERT INTO refresh_tokens VALUES ($1, $2, null)", [
      "a".repeat(64),
      session,
    ]);
    const before = await runner.query(
      "SELECT row_to_json(a) AS account, row_to_json(s) AS session, row_to_json(r) AS refresh FROM accounts a, auth_sessions s, refresh_tokens r",
    );
    await new GroupEvents1793664000000().up(runner);
    assert.deepEqual(
      await runner.query(
        "SELECT row_to_json(a) AS account, row_to_json(s) AS session, row_to_json(r) AS refresh FROM accounts a, auth_sessions s, refresh_tokens r",
      ),
      before,
    );
    const group = randomUUID();
    await runner.query("INSERT INTO groups VALUES ($1, $2, $3, now())", [
      group,
      account,
      "기존 계정 모임",
    ]);
    await runner.query("INSERT INTO events VALUES ($1, $2, $3, null, now())", [
      randomUUID(),
      group,
      "명단 없는 행사",
    ]);
    const beforeGroups = await runner.query("SELECT * FROM groups");
    const beforeEvents = await runner.query("SELECT * FROM events");
    const { PersonalEvents1794652800000 } =
      await import("../../src/database/migrations/1794652800000-PersonalEvents.js");
    const migration = new PersonalEvents1794652800000();
    await migration.up(runner);
    assert.deepEqual(await runner.query("SELECT * FROM groups"), beforeGroups);
    assert.deepEqual(
      await runner.query("SELECT * FROM events"),
      beforeEvents.map((row: object) => ({
        ...row,
        owner_id: account,
        version: 1,
      })),
    );
    assert.deepEqual(
      await runner.query(
        "SELECT row_to_json(a) AS account, row_to_json(s) AS session, row_to_json(r) AS refresh FROM accounts a, auth_sessions s, refresh_tokens r",
      ),
      before,
    );
    const { VerifiedSignup1794787200000 } =
      await import("../../src/database/migrations/1794787200000-VerifiedSignup.js");
    const signupMigration = new VerifiedSignup1794787200000();
    const preserved = await runner.query("SELECT * FROM accounts");
    const eventsBeforeSignup = await runner.query("SELECT * FROM events");
    await signupMigration.up(runner);
    assert.deepEqual(
      await runner.query("SELECT * FROM accounts"),
      preserved.map((row: object) => ({
        ...row,
        name: null,
        nickname: null,
        phone: null,
        phone_verified_at: null,
        email_verified_at: null,
      })),
    );
    assert.deepEqual(await runner.query("SELECT * FROM groups"), beforeGroups);
    assert.deepEqual(
      await runner.query("SELECT * FROM events"),
      eventsBeforeSignup,
    );
    assert.deepEqual(await runner.query("SELECT * FROM account_consents"), []);
    assert.deepEqual(
      await runner.query("SELECT * FROM phone_verifications"),
      [],
    );
    const { AccountTypes1794790800000 } =
      await import("../../src/database/migrations/1794790800000-AccountTypes.js");
    const accountTypes = new AccountTypes1794790800000();
    const beforeTypes = await runner.query("SELECT * FROM accounts");
    await accountTypes.up(runner);
    assert.deepEqual(
      await runner.query("SELECT * FROM accounts"),
      beforeTypes.map((row: object) => ({ ...row, account_type: null })),
    );
    assert.deepEqual(await runner.query("SELECT * FROM groups"), beforeGroups);
    assert.deepEqual(
      await runner.query("SELECT * FROM events"),
      eventsBeforeSignup,
    );
    const { EmailVerification1794873600000 } =
      await import("../../src/database/migrations/1794873600000-EmailVerification.js");
    const emailMigration = new EmailVerification1794873600000();
    const existingAccounts = await runner.query("SELECT * FROM accounts");
    const existingSessions = await runner.query("SELECT * FROM auth_sessions");
    await emailMigration.up(runner);
    assert.deepEqual(
      await runner.query("SELECT * FROM accounts"),
      existingAccounts,
    );
    assert.deepEqual(
      await runner.query("SELECT * FROM auth_sessions"),
      existingSessions,
    );
    assert.deepEqual(await runner.query("SELECT * FROM groups"), beforeGroups);
    assert.deepEqual(
      await runner.query("SELECT * FROM events"),
      eventsBeforeSignup,
    );
    assert.deepEqual(
      await runner.query("SELECT * FROM email_verifications"),
      [],
    );
    const { PasswordResetKakao1794960000000 } =
      await import("../../src/database/migrations/1794960000000-PasswordResetKakao.js");
    const social = new PasswordResetKakao1794960000000();
    await social.up(runner);
    assert.deepEqual(
      await runner.query("SELECT * FROM accounts"),
      existingAccounts.map((row: object) => ({
        ...row,
        email_verification_source: null,
        credentials_changed_at: null,
      })),
    );
    assert.deepEqual(
      await runner.query("SELECT * FROM auth_sessions"),
      existingSessions,
    );
    assert.deepEqual(await runner.query("SELECT * FROM groups"), beforeGroups);
    assert.deepEqual(
      await runner.query("SELECT * FROM events"),
      eventsBeforeSignup,
    );
    await runner.query("SAVEPOINT social_rollback");
    const { GroupRoster1795046400000 } =
      await import("../../src/database/migrations/1795046400000-GroupRoster.js");
    const roster = new GroupRoster1795046400000();
    await roster.up(runner);
    assert.deepEqual(
      await runner.query("SELECT * FROM groups"),
      beforeGroups.map((row: object) => ({
        ...row,
        group_type: null,
        creation_key: null,
        creation_digest: null,
      })),
    );
    assert.deepEqual(
      await runner.query("SELECT * FROM events"),
      eventsBeforeSignup,
    );
    await runner.query(
      "INSERT INTO group_members VALUES ($1,$2,'동명이인','0012',0,now()),($3,$2,'동명이인',null,1,now())",
      [randomUUID(), group, randomUUID()],
    );
    const { RosterAdditions1795132800000 } =
      await import("../../src/database/migrations/1795132800000-RosterAdditions.js");
    const additions = new RosterAdditions1795132800000();
    const preservedMembers = await runner.query(
      "SELECT * FROM group_members ORDER BY id",
    );
    const preservedGroups = await runner.query("SELECT * FROM groups");
    await additions.up(runner);
    assert.deepEqual(
      await runner.query("SELECT * FROM group_members ORDER BY id"),
      preservedMembers.map((row: object) => ({ ...row, label: null })),
    );
    assert.deepEqual(
      await runner.query("SELECT * FROM groups"),
      preservedGroups,
    );
    const { ReservationInquiries1795219200000 } =
      await import("../../src/database/migrations/1795219200000-ReservationInquiries.js");
    const inquiries = new ReservationInquiries1795219200000();
    const beforeInquiries = await runner.query(
      "SELECT row_to_json(e) AS event FROM events e ORDER BY id",
    );
    const accountsBeforeInquiries = await runner.query(
      "SELECT * FROM accounts",
    );
    await inquiries.up(runner);
    assert.deepEqual(
      await runner.query(
        "SELECT row_to_json(e) AS event FROM events e ORDER BY id",
      ),
      beforeInquiries,
    );
    assert.deepEqual(
      await runner.query("SELECT * FROM accounts"),
      accountsBeforeInquiries,
    );
    assert.deepEqual(
      await runner.query("SELECT * FROM groups"),
      preservedGroups,
    );

    const { RestaurantPhotosAndContactHistory1795302000000 } =
      await import("../../src/database/migrations/1795302000000-RestaurantPhotosAndContactHistory.js");
    const { EventAttendance1795305600000 } =
      await import("../../src/database/migrations/1795305600000-EventAttendance.js");
    const photos = new RestaurantPhotosAndContactHistory1795302000000(),
      attendance = new EventAttendance1795305600000();
    await runner.query("SAVEPOINT attendance_upgrade");
    const restaurant = randomUUID();
    await runner.query(
      "INSERT INTO restaurants(id,name,address,region,photo_path) VALUES($1,'기존 매장','보존 주소','세종대','/images/restaurants/original.png')",
      [restaurant],
    );
    const historicalContact = randomUUID(),
      historicalRequest = randomUUID(),
      historicalTarget = randomUUID();
    await runner.query(
      "INSERT INTO restaurant_contacts(id,restaurant_id,name,phone,request_consent_at) VALUES($1,$2,'당시 담당자','00000000000',now())",
      [historicalContact, restaurant],
    );
    await runner.query(
      "INSERT INTO reservation_requests(id,event_id,request_key,digest,snapshot,contact_name,contact_phone,created_at) SELECT $1,id,$2,$3,'{\"expectedGuests\":20}','총무','01000001234',now() FROM events LIMIT 1",
      [historicalRequest, randomUUID(), "a".repeat(64)],
    );
    await runner.query(
      "INSERT INTO reservation_request_targets(id,request_id,restaurant_id,restaurant_name,address,is_demo,contact_id,contact_name,contact_phone,consent_at) VALUES($1,$2,$3,'기존 매장','보존 주소',false,$4,'당시 담당자','00000000000',now())",
      [historicalTarget, historicalRequest, restaurant, historicalContact],
    );
    const requestsBeforeAttendance = await runner.query(
        "SELECT * FROM reservation_requests",
      ),
      targetsBeforeAttendance = await runner.query(
        "SELECT * FROM reservation_request_targets",
      );
    const restaurantBefore = await runner.query("SELECT * FROM restaurants");
    const membersBeforeAttendance = await runner.query(
      "SELECT * FROM group_members ORDER BY id",
    );
    await photos.up(runner);
    await attendance.up(runner);
    await runner.query("DELETE FROM restaurant_contacts WHERE id=$1", [
      historicalContact,
    ]);
    await runner.query("SAVEPOINT seed_receipts");
    const liveContact = randomUUID();
    await runner.query(
      "INSERT INTO restaurant_contacts(id,restaurant_id,name,phone) VALUES($1,$2,'보존 담당자','00000000000')",
      [liveContact, restaurant],
    );
    const contactsBeforeReceipts = await runner.query(
      "SELECT * FROM restaurant_contacts ORDER BY id",
    );
    const { RestaurantContactSeedReceipts1795312800000 } =
      await import("../../src/database/migrations/1795312800000-RestaurantContactSeedReceipts.js");
    const receipts = new RestaurantContactSeedReceipts1795312800000();
    await receipts.up(runner);
    const receiptIds = (await runner.query(
      "SELECT contact_id FROM restaurant_contact_seed_receipts ORDER BY contact_id",
    )) as { contact_id: string }[];
    assert(receiptIds.some((r) => r.contact_id === historicalContact));
    assert(receiptIds.some((r) => r.contact_id === liveContact));
    assert.deepEqual(
      await runner.query("SELECT * FROM restaurant_contacts ORDER BY id"),
      contactsBeforeReceipts,
    );
    await runner.query("DELETE FROM restaurant_contacts WHERE id=$1", [
      liveContact,
    ]);
    assert.equal(
      (
        await runner.query(
          "SELECT contact_id FROM restaurant_contact_seed_receipts WHERE contact_id=$1",
          [liveContact],
        )
      ).length,
      1,
    );
    await assert.rejects(receipts.down(runner), /preserving deleted contacts/);
    await runner.query("ROLLBACK TO SAVEPOINT seed_receipts");
    assert.deepEqual(
      await runner.query("SELECT * FROM reservation_requests"),
      requestsBeforeAttendance,
    );
    assert.deepEqual(
      await runner.query("SELECT * FROM reservation_request_targets"),
      targetsBeforeAttendance,
    );
    assert.deepEqual(
      await runner.query("SELECT * FROM restaurants"),
      restaurantBefore.map((r: object) => ({ ...r, space_photos: [] })),
    );
    assert.deepEqual(
      await runner.query("SELECT * FROM group_members ORDER BY id"),
      membersBeforeAttendance,
    );
    assert.deepEqual(
      await runner.query(
        "SELECT row_to_json(e) AS event FROM events e ORDER BY id",
      ),
      beforeInquiries,
    );
    assert.deepEqual(
      await runner.query("SELECT * FROM accounts"),
      accountsBeforeInquiries,
    );
    await attendance.down(runner);
    await attendance.up(runner);
    await runner.query(
      "INSERT INTO event_participants(id,event_id,name,position,created_at) SELECT $1,id,'추가 참여자',0,now() FROM events LIMIT 1",
      [randomUUID()],
    );
    await assert.rejects(
      attendance.down(runner),
      /preserving attendance records/,
    );
    await runner.query(
      'UPDATE restaurants SET space_photos=\'[{"path":"/images/restaurants/demo-1.png","description":"사진","position":1}]\'',
    );
    await assert.rejects(
      photos.down(runner),
      /preserving photo and contact history/,
    );
    await runner.query("ROLLBACK TO SAVEPOINT attendance_upgrade");
    await runner.query("SAVEPOINT room_migration");
    await photos.up(runner);
    await attendance.up(runner);
    const roomRestaurant = randomUUID(),
      hall = randomUUID(),
      room = randomUUID();
    await runner.query(
      "INSERT INTO restaurants(id,name,address,region) VALUES($1,'기존 매장','주소','지역')",
      [roomRestaurant],
    );
    await runner.query(
      "INSERT INTO restaurant_spaces(id,restaurant_id,label,kind,availability,together_seating,capacity) VALUES($1,$2,'기존 홀','HALL','AVAILABLE','YES',40)",
      [hall, roomRestaurant],
    );
    const oldSpaces = await runner.query("SELECT * FROM restaurant_spaces");
    const { RestaurantRooms1795309200000 } =
      await import("../../src/database/migrations/1795309200000-RestaurantRooms.js");
    const rooms = new RestaurantRooms1795309200000();
    await rooms.up(runner);
    assert.deepEqual(
      await runner.query("SELECT * FROM restaurant_spaces"),
      oldSpaces,
      "adding ROOM must preserve existing space records",
    );
    await runner.query(
      "INSERT INTO restaurant_spaces(id,restaurant_id,label,kind,availability,together_seating,capacity) VALUES($1,$2,'룸','ROOM','AVAILABLE','UNKNOWN',20)",
      [room, roomRestaurant],
    );
    await assert.rejects(rooms.down(runner), /preserving room and inquiry/);
    assert.equal(
      (
        await runner.query("SELECT kind FROM restaurant_spaces WHERE id=$1", [
          room,
        ])
      )[0].kind,
      "ROOM",
    );
    await runner.query("DELETE FROM restaurant_spaces WHERE id=$1", [room]);
    const roomInquiry = randomUUID();
    await runner.query(
      "INSERT INTO reservation_requests(id,event_id,request_key,digest,snapshot,contact_name,contact_phone,created_at) SELECT $1,id,$2,$3,$4::jsonb,'담당자','01000000000',now() FROM events LIMIT 1",
      [
        roomInquiry,
        randomUUID(),
        "a".repeat(64),
        JSON.stringify({ space: "ROOM" }),
      ],
    );
    await assert.rejects(
      rooms.down(runner),
      /preserving room and inquiry/,
      "a retained ROOM inquiry also prevents incompatible rollback",
    );
    await runner.query("DELETE FROM reservation_requests WHERE id=$1", [
      roomInquiry,
    ]);
    await rooms.down(runner);
    assert.deepEqual(
      await runner.query("SELECT * FROM restaurant_spaces"),
      oldSpaces,
    );
    await runner.query("ROLLBACK TO SAVEPOINT room_migration");
    await inquiries.down(runner);
    await runner.query("SAVEPOINT inquiry_rollback");
    await inquiries.up(runner);
    await runner.query(
      "INSERT INTO restaurants(id,name,address,region) VALUES($1,'보존 매장','주소','지역')",
      [randomUUID()],
    );
    await assert.rejects(
      inquiries.down(runner),
      /preserving restaurant and inquiry records/,
    );
    await runner.query("ROLLBACK TO SAVEPOINT inquiry_rollback");
    await additions.down(runner);
    await additions.up(runner);
    await runner.query(
      "UPDATE group_members SET label = '운영팀' WHERE position = 0",
    );
    await assert.rejects(additions.down(runner), /preserving labels/);
    await assert.rejects(roster.down(runner), /preserving roster/);
    await runner.query("ROLLBACK TO SAVEPOINT social_rollback");
    await roster.up(runner);
    await roster.down(runner);
    await runner.query(
      'UPDATE accounts SET "passwordHash" = NULL WHERE id = $1',
      [account],
    );
    await assert.rejects(social.down(runner), /cannot be represented/);
    await runner.query("ROLLBACK TO SAVEPOINT social_rollback");
    await social.down(runner);
    assert.deepEqual(
      await runner.query("SELECT * FROM accounts"),
      existingAccounts,
    );
    await emailMigration.down(runner);
    await runner.query("SAVEPOINT types_rollback");
    await runner.query(
      "UPDATE accounts SET account_type = 'organizer' WHERE id = $1",
      [account],
    );
    await assert.rejects(accountTypes.down(runner), /cannot be represented/);
    await runner.query("ROLLBACK TO SAVEPOINT types_rollback");
    await accountTypes.down(runner);
    assert.deepEqual(await runner.query("SELECT * FROM accounts"), beforeTypes);
    await runner.query("SAVEPOINT signup_rollback");
    await runner.query("UPDATE accounts SET name = '가입 이름' WHERE id = $1", [
      account,
    ]);
    await assert.rejects(signupMigration.down(runner), /cannot be represented/);
    await runner.query("ROLLBACK TO SAVEPOINT signup_rollback");
    await signupMigration.down(runner);
    assert.deepEqual(await runner.query("SELECT * FROM accounts"), preserved);
    // Untouched pre-upgrade data can still round-trip without deletion.
    await migration.down(runner);
    assert.deepEqual(await runner.query("SELECT * FROM events"), beforeEvents);
    // A broken legacy reference must abort rather than invent an owner.
    await runner.query("SAVEPOINT incomplete_backfill");
    await runner.query(
      "ALTER TABLE events DROP CONSTRAINT events_group_id_fkey",
    );
    await runner.query("UPDATE events SET group_id = $1", [randomUUID()]);
    await assert.rejects(migration.up(runner), /backfill is incomplete/);
    await runner.query("ROLLBACK TO SAVEPOINT incomplete_backfill");
    await migration.up(runner);
    const personalId = randomUUID();
    await runner.query(
      "INSERT INTO events (id, owner_id, group_id, name, scheduled_at, created_at) VALUES ($1, $2, null, '개인 행사', null, now())",
      [personalId, account],
    );
    for (const linked of [false, true]) {
      if (linked)
        await runner.query(
          "UPDATE events SET group_id = $1, version = 2 WHERE id = $2",
          [group, personalId],
        );
      const data = await runner.query("SELECT * FROM events ORDER BY id");
      await runner.query("SAVEPOINT safe_rollback");
      await assert.rejects(migration.down(runner), /cannot be represented/);
      await runner.query("ROLLBACK TO SAVEPOINT safe_rollback");
      assert.deepEqual(
        await runner.query("SELECT * FROM events ORDER BY id"),
        data,
      );
    }
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
  }
});

test("catalog migration preserves survey text and ambiguous rows while enforcing new identities", async (t) => {
  assert(process.env.TEST_DATABASE_URL);
  const { app } = await startTestApplication(process.env.TEST_DATABASE_URL);
  t.after(() => app.close());
  const db = await app.get(DatabaseService).connect();
  const q = db.createQueryRunner();
  await q.connect();
  await q.startTransaction();
  try {
    const schema = `catalog_${randomUUID().replaceAll("-", "")}`;
    await q.query(`CREATE SCHEMA ${schema}`);
    await q.query(`SET LOCAL search_path TO ${schema}`);
    const migrations = [...db.migrations].sort((a, b) =>
      a.constructor.name
        .slice(-13)
        .localeCompare(b.constructor.name.slice(-13)),
    );
    for (const migration of migrations)
      if (!migration.constructor.name.startsWith("RestaurantCatalogModel"))
        await migration.up(q);
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    await q.query(
      "INSERT INTO restaurants(id,name,address,region,booking_policy,deposit_policy,photo_path) VALUES ($1,'보존 식당','서울 길 1 2층','지역','전체 대관은 협의','금액 미정','/images/preserved.png'),($2,' 중복  식당 ','서울 길 2','지역',null,null,null),($3,'중복 식당','서울 길 2','지역',null,null,null)",
      ids,
    );
    const { RestaurantCatalogModel1795564800000 } =
      await import("../../src/database/migrations/1795564800000-RestaurantCatalogModel.js");
    await new RestaurantCatalogModel1795564800000().up(q);
    const [preserved] = await q.query(
      "SELECT policies,booking_policy,deposit_policy,photo_path,base_address,identity_review FROM restaurants WHERE id=$1",
      [ids[0]],
    );
    assert.equal(
      preserved.policies.sourceDescriptions.bookingPolicy,
      "전체 대관은 협의",
    );
    assert.equal(
      preserved.policies.sourceDescriptions.depositPolicy,
      "금액 미정",
    );
    assert.equal(preserved.policies.deposit.amount, null);
    assert.equal(preserved.booking_policy, "전체 대관은 협의");
    assert.equal(preserved.photo_path, "/images/preserved.png");
    assert.equal(preserved.base_address, null);
    assert.equal(preserved.identity_review, "UNSTRUCTURED_ADDRESS");
    const conflicts = await q.query(
      "SELECT id FROM restaurants WHERE identity_review='DUPLICATE_IDENTITY'",
    );
    assert.equal(conflicts.length, 2);
    await q.query("SAVEPOINT duplicate_attempt");
    await assert.rejects(
      q.query(
        "INSERT INTO restaurants(id,name,address,region) VALUES ($1,'중복 식당','서울 길 2','지역')",
        [randomUUID()],
      ),
      (error: unknown) => (error as { code: string }).code === "23505",
    );
    await q.query("ROLLBACK TO SAVEPOINT duplicate_attempt");
    assert.equal(
      (await q.query("SELECT count(*)::int AS count FROM restaurants"))[0]
        .count,
      3,
    );
  } finally {
    await q.rollbackTransaction();
    await q.release();
  }
});
