import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { validTaxDocument } from "./document.ts";

Deno.test("CPF e CNPJ conferem os dígitos verificadores, como no banco", () => {
  for (const ok of ["529.982.247-25", "12345678909", "11.222.333/0001-81"]) assertEquals(validTaxDocument(ok), true, ok);
  for (const bad of ["111.111.111-11", "12345678900", "11222333000180", "00000000000000", "123", "", null, 52998224725]) {
    assertEquals(validTaxDocument(bad), false, String(bad));
  }
});
