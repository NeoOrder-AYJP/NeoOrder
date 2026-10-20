// Fixtures no contrato das RPCs (supabase-schema.md), com volume realista
// baseado em seed_dados_demo() da migração 20261017_neoorder_hardening.sql.
const min = m => new Date(Date.now() - m * 60000).toISOString();

const pratos = [
  ['p1', 'Arroz com Feijão Preto', 'Arroz branco soltinho, feijão preto encorpado com linguiça, filé mignon grelhado e farofa da casa.', 35, 'assets/pratos/arroz-feijao-preto.jpg', true, true],
  ['p2', 'Cogumelos Salteados', 'Mix de cogumelos paris e shimeji salteados na manteiga com alho, ervas e parmesão.', 50, 'assets/pratos/cogumelos-salteados.jpg', false, false],
  ['p3', 'Pizza de 4 Queijos', 'Massa artesanal de fermentação natural com mussarela, gorgonzola, provolone e parmesão.', 70, 'assets/pratos/pizza-quatro-queijos.jpg', true, true],
  ['p4', 'Risoto de Cogumelos', 'Arroz arbóreo cremoso com cogumelos frescos, manteiga e parmesão, finalizado com ervas.', 90, 'assets/pratos/risoto-cogumelos.jpg', true, true],
  ['p5', 'Filé Mignon ao Roti', 'Medalhão de filé mignon com molho roti, batatas rústicas e aspargos salteados.', 89.9, 'assets/pratos/file-mignon.jpg', true, true],
  ['p6', 'Salmão Grelhado', 'Posta de salmão grelhado com manteiga de ervas, alcaparras e aspargos ao vapor.', 98, 'assets/pratos/salmao-grelhado.jpg', false, false],
  ['p7', 'Pasta Carbonara', 'Spaghetti com guanciale crocante, gemas, pecorino romano e pimenta-do-reino.', 49, 'assets/pratos/pasta-carbonara.jpg', false, true],
  ['p8', 'Burger Artesanal NeoOrder', 'Blend angus 180g, cheddar, bacon crocante e maionese da casa no pão brioche, com batatas rústicas.', 42, 'assets/pratos/burger-artesanal.jpg', false, true]
];

const insumos = ['Arroz branco|kg|20', 'Feijão preto|kg|12', 'Linguiça calabresa|kg|6', 'Filé mignon|kg|8', 'Farofa pronta|kg|5',
  'Cogumelo paris|kg|0', 'Cogumelo shimeji|kg|0.4', 'Arroz arbóreo|kg|10', 'Queijo parmesão|kg|4', 'Manteiga|kg|6',
  'Massa spaghetti|kg|8', 'Guanciale|kg|4', 'Ovos|un|120', 'Queijo pecorino|kg|3', 'Pão brioche|un|40',
  'Blend angus 180g|un|40', 'Queijo cheddar|kg|4', 'Bacon|kg|4', 'Batata|kg|20', 'Salmão fresco|kg|0',
  'Aspargos|kg|4', 'Farinha de trigo|kg|15', 'Molho de tomate|l|8', 'Queijo mussarela|kg|8', 'Queijo gorgonzola|kg|3',
  'Queijo provolone|kg|3', 'Manjericão|un|20'].map((s, i) => {
  const [nome, unidade, q] = s.split('|');
  return { id: 'e' + (i + 1), nome, unidade, quantidade: Number(q), atualizado_em: min(30), pratos_vinculados: 1 + (i % 3) };
});

const itens = (...l) => l.map(([nome, quantidade, preco_unitario]) => ({ nome, quantidade, preco_unitario, prato_id: 'p1' }));

export const fixture = {
  pratos_cardapio: pratos.map(([id, nome, descricao, preco, imagem, destaque, disponivel]) =>
    ({ id, nome, descricao, preco, imagem, destaque, disponivel, porcoes: disponivel ? 20 : 0 })),
  sistema_precisa_bootstrap: false,
  painel_atendimento: {
    chamados: [
      { id: 'c1', mesa_nome: 'Mesa 02', justificativa: 'Pedir a conta', status: 'Pendente', criado_em: min(2) },
      { id: 'c2', mesa_nome: 'Mesa 05', justificativa: 'Trocar item do pedido: o risoto veio sem parmesão e a cliente tem restrição a lactose', status: 'Pendente', criado_em: min(6) },
      { id: 'c3', mesa_nome: 'Mesa 01', justificativa: 'Solicitar talheres/copos', status: 'Pendente', criado_em: min(11) }
    ],
    pedidos: [
      { id: 'o1aaaaaa-1', mesa_nome: 'Mesa 01', status: 'Pendente', valor_total: 180, criado_em: min(3), itens: itens(['Risoto de Cogumelos', 2, 90]) },
      { id: 'o2aaaaaa-2', mesa_nome: 'Mesa 03', status: 'Pendente', valor_total: 161.9, criado_em: min(5), itens: itens(['Pizza de 4 Queijos', 1, 70], ['Filé Mignon ao Roti', 1, 89.9]) },
      { id: 'o3aaaaaa-3', mesa_nome: 'Mesa 04', status: 'Em Preparo', valor_total: 133, criado_em: min(9), itens: itens(['Burger Artesanal NeoOrder', 2, 42], ['Pasta Carbonara', 1, 49]) },
      { id: 'o4aaaaaa-4', mesa_nome: 'Mesa 06', status: 'Em Preparo', valor_total: 35, criado_em: min(12), itens: itens(['Arroz com Feijão Preto', 1, 35]) },
      { id: 'o5aaaaaa-5', mesa_nome: 'Mesa 02', status: 'Pronto', valor_total: 98, criado_em: min(20), itens: itens(['Salmão Grelhado', 1, 98]) },
      { id: 'o6aaaaaa-6', mesa_nome: 'Mesa 05', status: 'Pronto', valor_total: 140, criado_em: min(25), itens: itens(['Pizza de 4 Queijos', 2, 70]) }
    ],
    gerado_em: min(0)
  },
  listar_estoque: insumos,
  listar_pratos_admin: pratos.map(([id, nome, descricao, preco, imagem, destaque, disponivel]) => ({
    id, nome, descricao, preco, imagem, destaque, ativo: id !== 'p7', disponivel, porcoes: disponivel ? 20 : 0,
    receita: [{ ingrediente_id: 'e1', nome: 'Arroz branco', unidade: 'kg', quantidade: 0.15 },
              { ingrediente_id: 'e2', nome: 'Feijão preto', unidade: 'kg', quantidade: 0.12 },
              { ingrediente_id: 'e4', nome: 'Filé mignon', unidade: 'kg', quantidade: 0.1 }]
  })),
  listar_contas: [
    { id: 'u1', tipo: 'funcionario', nome: 'Gerente NeoOrder', login: 'gerente', perfil: 'gerente', ativo: true, criado_em: min(9000), tem_senha: true },
    { id: 'u2', tipo: 'funcionario', nome: 'Atendente NeoOrder', login: 'atendente', perfil: 'atendente', ativo: true, criado_em: min(9000), tem_senha: true },
    { id: 'u3', tipo: 'funcionario', nome: 'jfpalacio29@gmail.com', login: 'jfpalacio29@gmail.com', perfil: 'atendente', ativo: false, criado_em: min(20000), tem_senha: false },
    ...[1, 2, 3, 4, 5, 6].map(n => ({ id: 'm' + n, tipo: 'mesa', nome: 'Mesa 0' + n, login: 'Mesa 0' + n, perfil: 'mesa', ativo: true, criado_em: min(9000), tem_senha: true }))
  ],
  status_qr_mesas: {
    mesas: [1, 2, 3, 4, 5, 6].map(n => ({ mesa_id: 'm' + n, mesa_nome: 'Mesa 0' + n, ativo: true, qr_code_ativo: n <= 2, sessao_aberta: n === 1 })),
    gerado_em: min(0)
  },
  relatorio_faturamento: {
    faturamento_total: 1873.7, qtd_pedidos: 14, ticket_medio: 133.84, qtd_cancelados: 2,
    pratos_mais_vendidos: [
      { nome: 'Risoto de Cogumelos', quantidade: 8, receita: 720 }, { nome: 'Pizza de 4 Queijos', quantidade: 7, receita: 490 },
      { nome: 'Filé Mignon ao Roti', quantidade: 3, receita: 269.7 }, { nome: 'Burger Artesanal NeoOrder', quantidade: 5, receita: 210 },
      { nome: 'Pasta Carbonara', quantidade: 2, receita: 98 }, { nome: 'Arroz com Feijão Preto', quantidade: 2, receita: 70 }
    ],
    pedidos: Array.from({ length: 12 }, (_, i) => ({
      id: `f${i}e4b2c1-aaaa-bbbb-cccc-000000000000`, mesa_nome: 'Mesa 0' + ((i % 6) + 1),
      status: i === 3 || i === 8 ? 'Cancelado' : 'Entregue', valor_total: 70 + i * 12.5, criado_em: min(60 * i), entregue_em: min(60 * i - 20)
    })),
    periodo: {}
  },
  meus_pedidos_mesa: [
    { id: 'h1aaaaaa-1', status: 'Em Preparo', valor_total: 180, criado_em: min(10), entregue_em: null, itens: itens(['Risoto de Cogumelos', 2, 90]) },
    { id: 'h2aaaaaa-2', status: 'Entregue', valor_total: 112, criado_em: min(60), entregue_em: min(40), itens: itens(['Pizza de 4 Queijos', 1, 70], ['Burger Artesanal NeoOrder', 1, 42]) },
    { id: 'h3aaaaaa-3', status: 'Cancelado', valor_total: 49, criado_em: min(90), entregue_em: null, itens: itens(['Pasta Carbonara', 1, 49]) }
  ],
  backup_exportar: { meta: {}, tabelas: {} }
};

const exp = () => new Date(Date.now() + 3600000).toISOString();
export const sessions = {
  mesa: { usuario: { id: 'm1', nome: 'Mesa 01', login: 'Mesa 01', tipo: 'mesa', perfil: 'mesa' }, token: 'a'.repeat(64), tipoSessao: 'mesa', expiraEm: exp() },
  gerente: { usuario: { id: 'u1', nome: 'Gerente NeoOrder', login: 'gerente', tipo: 'funcionario', perfil: 'gerente' }, token: 'b'.repeat(64), tipoSessao: 'funcionario', expiraEm: exp() },
  atendente: { usuario: { id: 'u2', nome: 'Atendente NeoOrder', login: 'atendente', tipo: 'funcionario', perfil: 'atendente' }, token: 'c'.repeat(64), tipoSessao: 'funcionario', expiraEm: exp() }
};
