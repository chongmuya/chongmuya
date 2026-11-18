import type { MigrationInterface, QueryRunner } from "typeorm";

export class ReservationInquiries1795219200000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE restaurants (
        id uuid CONSTRAINT restaurants_pkey PRIMARY KEY, name varchar(100) NOT NULL,
        address varchar(240) NOT NULL, region varchar(80) NOT NULL, category varchar(40),
        latitude double precision, longitude double precision, max_capacity integer,
        photo_path varchar(500), operating_hours text, facilities text,
        booking_policy text, deposit_policy text, menu_policy text, cancellation_policy text,
        published boolean NOT NULL DEFAULT false, is_demo boolean NOT NULL DEFAULT false, verified_at timestamptz,
        CONSTRAINT restaurants_capacity_check CHECK (max_capacity IS NULL OR max_capacity > 0),
        CONSTRAINT restaurants_coordinates_check CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180))
      );
      CREATE INDEX restaurants_public_region ON restaurants (published, region);
      CREATE TABLE restaurant_spaces (
        id uuid CONSTRAINT restaurant_spaces_pkey PRIMARY KEY,
        restaurant_id uuid NOT NULL CONSTRAINT restaurant_spaces_restaurant_id_fkey REFERENCES restaurants(id),
        label varchar(80) NOT NULL, kind varchar(10) NOT NULL, availability varchar(16) NOT NULL,
        together_seating varchar(8) NOT NULL, capacity integer, min_guests integer, min_spend integer, separate_fee integer, conditions text,
        CONSTRAINT restaurant_spaces_kind_check CHECK (kind IN ('HALL','FLOOR','WHOLE')),
        CONSTRAINT restaurant_spaces_availability_check CHECK (availability IN ('AVAILABLE','UNAVAILABLE','UNKNOWN')),
        CONSTRAINT restaurant_spaces_seating_check CHECK (together_seating IN ('YES','NO','UNKNOWN')),
        CONSTRAINT restaurant_spaces_numbers_check CHECK ((capacity IS NULL OR capacity > 0) AND (min_guests IS NULL OR min_guests >= 0) AND (min_spend IS NULL OR min_spend >= 0) AND (separate_fee IS NULL OR separate_fee >= 0))
      );
      CREATE INDEX restaurant_spaces_restaurant ON restaurant_spaces(restaurant_id);
      CREATE TABLE restaurant_menus (
        id uuid CONSTRAINT restaurant_menus_pkey PRIMARY KEY,
        restaurant_id uuid NOT NULL CONSTRAINT restaurant_menus_restaurant_id_fkey REFERENCES restaurants(id),
        name varchar(100) NOT NULL, kind varchar(8) NOT NULL, price integer, unit varchar(30) NOT NULL, available boolean NOT NULL DEFAULT true,
        CONSTRAINT restaurant_menus_price_check CHECK (price IS NULL OR price >= 0),
        CONSTRAINT restaurant_menus_kind_check CHECK (kind IN ('REGULAR','SET'))
      );
      CREATE INDEX restaurant_menus_restaurant ON restaurant_menus(restaurant_id);
      CREATE TABLE restaurant_contacts (
        id uuid CONSTRAINT restaurant_contacts_pkey PRIMARY KEY,
        restaurant_id uuid NOT NULL CONSTRAINT restaurant_contacts_restaurant_id_fkey REFERENCES restaurants(id),
        name varchar(80) NOT NULL, phone varchar(20) NOT NULL, active boolean NOT NULL DEFAULT true,
        request_consent_at timestamptz, consent_note text
      );
      CREATE INDEX restaurant_contacts_restaurant ON restaurant_contacts(restaurant_id, active);
      CREATE UNIQUE INDEX restaurant_contacts_id_restaurant ON restaurant_contacts(id, restaurant_id);
      CREATE TABLE reservation_requests (
        id uuid CONSTRAINT reservation_requests_pkey PRIMARY KEY,
        event_id uuid NOT NULL CONSTRAINT reservation_requests_event_id_fkey REFERENCES events(id),
        request_key uuid NOT NULL, digest varchar(64) NOT NULL, snapshot jsonb NOT NULL,
        contact_name varchar(80) NOT NULL, contact_phone varchar(20) NOT NULL,
        contact_phone_verified_at timestamptz, created_at timestamptz NOT NULL
      );
      CREATE UNIQUE INDEX reservation_requests_event_unique ON reservation_requests(event_id);
      CREATE INDEX reservation_requests_created ON reservation_requests(created_at);
      CREATE TABLE reservation_request_targets (
        id uuid CONSTRAINT reservation_request_targets_pkey PRIMARY KEY,
        request_id uuid NOT NULL CONSTRAINT reservation_targets_request_id_fkey REFERENCES reservation_requests(id),
        restaurant_id uuid NOT NULL CONSTRAINT reservation_targets_restaurant_id_fkey REFERENCES restaurants(id),
        restaurant_name varchar(100) NOT NULL, address varchar(240) NOT NULL, is_demo boolean NOT NULL,
        contact_id uuid NOT NULL, contact_name varchar(80) NOT NULL, contact_phone varchar(20) NOT NULL, consent_at timestamptz NOT NULL,
        delivery_status varchar(16) NOT NULL DEFAULT 'PENDING',
        CONSTRAINT reservation_targets_contact_fkey FOREIGN KEY(contact_id, restaurant_id) REFERENCES restaurant_contacts(id, restaurant_id),
        CONSTRAINT reservation_targets_status_check CHECK (delivery_status = 'PENDING')
      );
      CREATE UNIQUE INDEX reservation_targets_request_restaurant ON reservation_request_targets(request_id, restaurant_id);
      CREATE INDEX reservation_targets_delivery ON reservation_request_targets(delivery_status);
    `);
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query(
      "LOCK TABLE restaurants, restaurant_spaces, restaurant_menus, restaurant_contacts, reservation_requests, reservation_request_targets IN ACCESS EXCLUSIVE MODE",
    );
    const [result] = (await runner.query(
      "SELECT EXISTS(SELECT 1 FROM restaurants) OR EXISTS(SELECT 1 FROM reservation_requests) AS occupied",
    )) as { occupied: boolean }[];
    if (result?.occupied)
      throw new Error(
        "ReservationInquiries rollback requires a forward migration preserving restaurant and inquiry records.",
      );
    await runner.query(
      "DROP TABLE reservation_request_targets, reservation_requests, restaurant_contacts, restaurant_menus, restaurant_spaces, restaurants",
    );
  }
}
