import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CredentialsDto } from "../src/modules/auth/dto/request/credentials.request.dto.js";

test("credentials enforce ASCII 8–16 without composition requirements or password normalization", async () => {
  for (const password of ["abcdefgh", "12345678", "!@#$%^&*", "a".repeat(16)]) {
    const dto = plainToInstance(CredentialsDto, {
      email: " User@example.com ",
      password,
    });
    assert.deepEqual(await validate(dto), []);
    assert.equal(dto.email, "user@example.com");
    assert.equal(dto.password, password);
  }
  for (const password of [
    "a".repeat(7),
    "a".repeat(17),
    " abcdefgh",
    "abcdefgh ",
    "abcd\nefgh",
    "가나다라마바사아",
    "abcdefg😀",
    "abcdefg\u007f",
  ]) {
    const dto = plainToInstance(CredentialsDto, {
      email: "user@example.com",
      password,
    });
    assert.equal(
      (await validate(dto)).some((error) => error.property === "password"),
      true,
    );
    assert.equal(dto.password, password);
  }
});
