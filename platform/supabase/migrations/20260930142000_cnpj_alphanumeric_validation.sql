-- CNPJ alfanumérico (Receita Federal, a partir de julho/2026).
--
-- O app do restaurante aceitava qualquer caractere no CNPJ (guardado em
-- restaurants.settings->>'cnpj', que aparece no recibo do cliente). Agora o
-- servidor valida o padrão: 12 posições [0-9A-Z] + 2 dígitos verificadores
-- numéricos, módulo 11 com valor do caractere = ASCII − 48. CNPJ numérico
-- antigo continua válido pela mesma regra. A validação só roda quando o CNPJ
-- muda, então restaurantes antigos com dado legado não travam outras edições.

create or replace function private.is_valid_cnpj(p_cnpj text)
returns boolean language plpgsql immutable as $$
declare
  v_cnpj text := upper(regexp_replace(coalesce(p_cnpj, ''), '[^0-9A-Za-z]', '', 'g'));
  v_weights_1 constant integer[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  v_weights_2 constant integer[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  v_sum integer;
  v_digit_1 integer;
  v_digit_2 integer;
begin
  if v_cnpj !~ '^[0-9A-Z]{12}[0-9]{2}$' then return false; end if;
  -- Sequências de um caractere só passam no módulo 11 mas não são CNPJ.
  if v_cnpj ~ '^(.)\1+$' then return false; end if;

  v_sum := 0;
  for i in 1..12 loop
    v_sum := v_sum + (ascii(substr(v_cnpj, i, 1)) - 48) * v_weights_1[i];
  end loop;
  v_digit_1 := case when v_sum % 11 < 2 then 0 else 11 - v_sum % 11 end;

  v_sum := 0;
  for i in 1..12 loop
    v_sum := v_sum + (ascii(substr(v_cnpj, i, 1)) - 48) * v_weights_2[i];
  end loop;
  v_sum := v_sum + v_digit_1 * v_weights_2[13];
  v_digit_2 := case when v_sum % 11 < 2 then 0 else 11 - v_sum % 11 end;

  return substr(v_cnpj, 13, 1)::integer = v_digit_1 and substr(v_cnpj, 14, 1)::integer = v_digit_2;
end $$;

create or replace function private.restaurants_validate_cnpj()
returns trigger language plpgsql
set search_path = public, private, pg_temp as $$
declare
  v_new text := nullif(btrim(coalesce(new.settings->>'cnpj', '')), '');
  v_old text := case when tg_op = 'UPDATE' then nullif(btrim(coalesce(old.settings->>'cnpj', '')), '') end;
begin
  if v_new is not null and v_new is distinct from v_old and not private.is_valid_cnpj(v_new) then
    raise exception 'CNPJ inválido. Use 14 caracteres (letras e números) no padrão da Receita Federal.'
      using errcode = '22023';
  end if;
  return new;
end $$;

drop trigger if exists restaurants_validate_cnpj on public.restaurants;
create trigger restaurants_validate_cnpj
  before insert or update of settings on public.restaurants
  for each row execute function private.restaurants_validate_cnpj();
