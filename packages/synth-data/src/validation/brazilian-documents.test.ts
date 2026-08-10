import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatCnpj,
  formatCpf,
  generateValidCnpj,
  generateValidCpf,
  isValidCnpj,
  isValidCpf,
} from "./brazilian-documents.js";

test("isValidCpf accepts a known-valid checksum, formatted or bare", () => {
  assert.equal(isValidCpf("11144477735"), true);
  assert.equal(isValidCpf("111.444.777-35"), true);
});

test("isValidCpf rejects a wrong check digit", () => {
  assert.equal(isValidCpf("11144477736"), false);
});

test("isValidCpf rejects all-same-digit and wrong-length input", () => {
  assert.equal(isValidCpf("11111111111"), false);
  assert.equal(isValidCpf("123"), false);
});

test("isValidCnpj accepts a known-valid checksum, formatted or bare", () => {
  assert.equal(isValidCnpj("11222333000181"), true);
  assert.equal(isValidCnpj("11.222.333/0001-81"), true);
});

test("isValidCnpj rejects a wrong check digit", () => {
  assert.equal(isValidCnpj("11222333000180"), false);
});

test("generateValidCpf/generateValidCnpj always produce a checksum-valid, deterministic document", () => {
  const cpf = generateValidCpf(42);
  assert.equal(isValidCpf(cpf), true);
  assert.equal(generateValidCpf(42), cpf);

  const cnpj = generateValidCnpj(42);
  assert.equal(isValidCnpj(cnpj), true);
  assert.equal(generateValidCnpj(42), cnpj);
});

test("formatCpf/formatCnpj punctuate a bare digit string", () => {
  assert.equal(formatCpf("11144477735"), "111.444.777-35");
  assert.equal(formatCnpj("11222333000181"), "11.222.333/0001-81");
});
