import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Textos em português sem acento são erro de ortografia que o usuário vê
 * ("Autenticacao", "Nao foi possivel…"). Esta trava varre os valores de texto do
 * pt-BR e falha com a lista das palavras que voltarem sem acento.
 */
const UNACCENTED_WORDS = [
  'acao', 'acoes', 'aniversario', 'atencao', 'atualizacao', 'autenticacao', 'avaliacao', 'avaliacoes', 'cardapio',
  'cartao', 'cartoes', 'codigo', 'configuracao', 'configuracoes', 'conexao', 'conteudo', 'credito', 'debito',
  'descricao', 'disponivel', 'divisao', 'endereco', 'experiencia', 'facil', 'garcom', 'gestao', 'gratis',
  'historico', 'horario', 'horarios', 'informacao', 'informacoes', 'inicio', 'invalido', 'invalida', 'liquido',
  'maximo', 'medio', 'metodo', 'metodos', 'minimo', 'nao', 'nivel', 'notificacao', 'notificacoes', 'numero',
  'opiniao', 'periodo', 'permissao', 'politica', 'possivel', 'preco', 'previsao', 'proximo', 'relatorio',
  'sao', 'seguranca', 'servico', 'servicos', 'sessao', 'solicitacao', 'tecnica', 'transacao', 'ultima', 'ultimo',
  'usuario', 'versao', 'visao', 'voce',
];

function stringValues(source: string): string[] {
  const values: string[] = [];
  const literal = /(['"`])((?:\\.|(?!\1).)*)\1/g;
  for (const line of source.split('\n')) {
    // Só o que vem depois da chave: "chave: 'texto'" ou uma linha que é só o texto.
    const afterKey = line.replace(/^\s*(?:['"][\w.\-]+['"]|[\w.\-]+)\s*:\s*/, '');
    let match: RegExpExecArray | null;
    while ((match = literal.exec(afterKey))) values.push(match[2]);
  }
  return values;
}

describe('pt-BR sem acentos faltando', () => {
  const dir = path.join(__dirname, '..', 'i18n');

  it.each(['pt-BR.ts', 'pt-BR-supplement.ts'])('%s não tem palavras comuns sem acento', (file) => {
    const source = fs.readFileSync(path.join(dir, file), 'utf8');
    const pattern = new RegExp(`\\b(${UNACCENTED_WORDS.join('|')})\\b`, 'i');
    const offenders = stringValues(source).filter((value) => pattern.test(value));
    expect(offenders).toEqual([]);
  });
});
