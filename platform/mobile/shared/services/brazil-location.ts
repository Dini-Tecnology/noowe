export interface BrazilStateOption {
  id: number;
  code: string;
  name: string;
}

export interface BrazilCityOption {
  id: number;
  name: string;
  stateCode: string;
}

export interface BrazilPostalCodeResult {
  postalCode: string;
  street: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
}

const IBGE_BASE_URL = 'https://servicodados.ibge.gov.br/api/v1/localidades';
const VIA_CEP_BASE_URL = 'https://viacep.com.br/ws';

let statesCache: BrazilStateOption[] | null = null;
const citiesCache = new Map<string, BrazilCityOption[]>();

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('Serviço de localização indisponível. Tente novamente.');
    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('A consulta demorou demais. Verifique sua conexão e tente novamente.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function lookupBrazilianPostalCode(postalCode: string): Promise<BrazilPostalCodeResult> {
  const digits = postalCode.replace(/\D/g, '');
  if (digits.length !== 8) throw new Error('Informe um CEP válido com 8 números.');

  const result = await fetchJson<{
    erro?: boolean;
    cep?: string;
    logradouro?: string;
    complemento?: string;
    bairro?: string;
    localidade?: string;
    uf?: string;
  }>(`${VIA_CEP_BASE_URL}/${digits}/json/`);

  if (result.erro) throw new Error('CEP não encontrado. Confira os números informados.');
  return {
    postalCode: result.cep ?? postalCode,
    street: result.logradouro ?? '',
    complement: result.complemento ?? '',
    neighborhood: result.bairro ?? '',
    city: result.localidade ?? '',
    state: result.uf ?? '',
  };
}

export async function getBrazilianStates(): Promise<BrazilStateOption[]> {
  if (statesCache) return statesCache;
  const rows = await fetchJson<Array<{ id: number; sigla: string; nome: string }>>(
    `${IBGE_BASE_URL}/estados?orderBy=nome`,
  );
  statesCache = rows.map((row) => ({ id: row.id, code: row.sigla, name: row.nome }));
  return statesCache;
}

function readStateCode(row: any): string {
  return row?.microrregiao?.mesorregiao?.UF?.sigla
    ?? row?.regiaoImediata?.regiaoIntermediaria?.UF?.sigla
    ?? '';
}

export async function getBrazilianCities(stateCode?: string): Promise<BrazilCityOption[]> {
  const cacheKey = stateCode?.toUpperCase() || 'ALL';
  const cached = citiesCache.get(cacheKey);
  if (cached) return cached;

  const path = stateCode
    ? `/estados/${encodeURIComponent(stateCode.toUpperCase())}/municipios?orderBy=nome`
    : '/municipios?orderBy=nome';
  const rows = await fetchJson<any[]>(`${IBGE_BASE_URL}${path}`);
  const cities = rows.map((row) => ({ id: row.id, name: row.nome, stateCode: readStateCode(row) || cacheKey }));
  citiesCache.set(cacheKey, cities);
  return cities;
}
