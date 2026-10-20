// Portuguese texts of the schematic editor (web/js/sch-editor.js) and of its read-only views, the RTL
// and Technology Schematics (#130): the symbol palette and its tooltips (the descriptions of
// core/schdoc.js SYMBOLS), the properties panel, the status bar; merged into web/js/i18n.js.
export const SCH_PT = {
  // palette
  'Symbols': 'Símbolos', 'Categories': 'Categorias', '<--All Symbols-->': '<--Todos os Símbolos-->',
  'No other modules in the project': 'Nenhum outro módulo no projeto',
  // the descriptions of the symbols (palette tooltips); gates in SCH_PT_PATTERNS
  'Inverter': 'Inversor',
  '2:1 multiplexer (O = S0 ? D1 : D0)': 'Multiplexador 2:1 (O = S0 ? D1 : D0)',
  'Adder S = A + B (+ CI), optional carry out': 'Somador S = A + B (+ CI), transporte de saída opcional',
  'Comparator O = A <op> B': 'Comparador O = A <op> B',
  'Constant value (decimal, 0x.. hex or 0b.. binary)': 'Valor constante (decimal, 0x.. hexadecimal ou 0b.. binário)',
  'Logic 1 (all bits)': '1 lógico (todos os bits)', 'Logic 0 (all bits)': '0 lógico (todos os bits)',
  'N-bit register': 'Registo de N bits', 'N-bit binary counter': 'Contador binário de N bits',
  'Select bits I(msb downto lsb) of a bus': 'Seleciona os bits I(msb downto lsb) de um barramento',
  'Concatenate inputs (I0 is the most significant part)': 'Concatena as entradas (I0 é a parte mais significativa)',
  'Instance of a project module/entity': 'Instância de um módulo/entidade do projeto',
  'Box with explicit pins carrying HDL statements emitted verbatim': 'Caixa com pinos explícitos e instruções HDL copiadas tal e qual',
  // parameters of the symbols (as in the Symbol Info datasheets, core/symdocs.js) and their options
  'Pins per bit (A0.., B0.., S0..)': 'Um pino por bit (A0.., B0.., S0..)', 'Pins per bit (A0.., B0..)': 'Um pino por bit (A0.., B0..)', 'Pins per bit (Q0..)': 'Um pino por bit (Q0..)', 'Pins per bit (A0.., B0.., D0..)': 'Um pino por bit (A0.., B0.., D0..)', 'Borrow in (BI)': 'Empréstimo de entrada (BI)', 'Borrow out (BO)': 'Empréstimo de saída (BO)',
  'Subtractor D = A - B (- BI), optional borrow out': 'Subtrator D = A - B (- BI), empréstimo de saída opcional',
  'Carry in': 'Transporte de entrada (carry in)', 'Carry out': 'Transporte de saída (carry out)', 'Operation': 'Operação', 'Signed': 'Com sinal',
  'Clock enable': 'Habilitação do relógio', 'Reset/INIT value': 'Valor de reset/INIT', 'MSB index': 'Índice do MSB', 'LSB index': 'Índice do LSB',
  'Input widths (MSB first)': 'Larguras das entradas (MSB primeiro)',
  'none': 'nenhum', 'async': 'assíncrono', 'sync': 'síncrono', 'up': 'crescente', 'down': 'decrescente',
  // properties panel
  'Properties': 'Propriedades', 'Parameters': 'Parâmetros', 'empty = module default': 'vazio = valor por omissão do módulo',
  'Names': 'Nomes', 'Clock enable (CE)': 'Habilitação do relógio (CE)', 'Asynchronous clear (CLR)': 'Limpeza assíncrona (CLR)', 'Asynchronous preset (PRE)': 'Preset assíncrono (PRE)', 'Synchronous reset (R)': 'Reset síncrono (R)', 'Synchronous set (S)': 'Set síncrono (S)', 'not with the other inputs chosen (no such Xilinx flip-flop)': 'não com as outras entradas escolhidas (não há esse flip-flop Xilinx)', 'Show the name of every instance and every net (the automatic ones too)': 'Mostrar o nome de todas as instâncias e de todas as redes (também os automáticos)',
  // a net name another net has (#689)
  'Net name already used': 'Nome de rede já usado', 'Connect by name': 'Ligar pelo nome',
  'Connect this net to it by name? They become one net, without a wire drawn between them.': 'Ligar esta rede a ela pelo nome? Passam a ser uma só rede, sem um fio desenhado entre elas.',
  'Rotate': 'Rodar', 'Mirror': 'Espelhar', 'Wire': 'Fio', 'I/O Marker': 'Marcador de E/S', 'Net Name': 'Nome de Rede',
  'Bidirectional': 'Bidirecional', 'Auto direction': 'Direção automática',
  // the Add I/O Marker tool: on a wire, a pin or empty space (#680)
  'Add I/O Marker: click a wire end, a pin or empty space to add a port marker (a wire to its tip connects it later).':
    'Adicionar Marcador de E/S: clique na ponta de um fio, num pino ou num espaço vazio para adicionar um marcador de porto (um fio até à sua ponta liga-o depois).',
  'Input port name': 'Nome do porto de entrada', 'Output port name': 'Nome do porto de saída', 'Bidirectional port name': 'Nome do porto bidirecional',
  'optional, overrides the type derived from the width': 'opcional, substitui o tipo derivado da largura',
  'one per line: name[width] (add "clock" for a clock pin)': 'um por linha: nome[largura] (acrescente "clock" para um pino de relógio)',
  'name[width], add "reg" if assigned in always/initial': 'nome[largura], acrescente "reg" se atribuído em always/initial',
  'name[width]': 'nome[largura]',
  'No errors or warnings found.': 'Nenhum erro ou aviso encontrado.',
};

export const SCH_PT_PATTERNS = [
  [/^Another net is already named '(.*)'\.$/, "Já há outra rede chamada '$1'."],
  // the multiplexers and demultiplexers, with and without the enable E (#301)
  [/^(\d+):1 multiplexer \(select ([S\d ]+)\)$/, 'Multiplexador $1:1 (seleção $2)'],
  [/^(\d+):1 multiplexer with enable \(Xilinx (\w+)\): O = (.+) when E = 1, 0 when E = 0$/, 'Multiplexador $1:1 com habilitação (Xilinx $2): O = $3 quando E = 1, 0 quando E = 0'],
  [/^1:(\d+) demultiplexer( with enable)? \(select ([S\d ]+)\): O<S> = D( when E = 1)?, the other outputs 0( \(all 0 when E = 0\))? \(bitwise when Width > 1\)$/,
    (m, n, en, sel, w, all) => `Desmultiplexador 1:${n}${en ? ' com habilitação' : ''} (seleção ${sel}): O<S> = D${w ? ' quando E = 1' : ''}, as outras saídas a 0${all ? ' (todas a 0 quando E = 0)' : ''} (bit a bit quando Largura > 1)`],
  [/^(\d)-input (AND|OR|NAND|NOR|XOR|XNOR) gate \(bitwise when Width > 1\)$/, 'Porta $2 de $1 entradas (bit a bit quando Largura > 1)'],
  [/^(\d+) ports( · .*)?$/, (m, n, rest) => `${n} porto${n === '1' ? '' : 's'}${rest || ''}`],
  [/^(\d+) objects selected$/, '$1 objetos selecionados'],
  [/^Module (\S+)$/, 'Módulo $1'],
  [/^Pins \((\d+)\)$/, 'Pinos ($1)'],
  [/^Wire · net (.+)$/, 'Fio · rede $1'],
  [/^Net '(.*)', (\d+) (bits?)$/s, "Rede '$1', $2 $3"],
  [/^(VHDL|VERILOG) statements \(emitted verbatim\)$/, 'Instruções $1 (copiadas tal e qual)'],
  [/^(\d+) symbols?, (\d+) nets(?: · (\d+) error\(s\), (\d+) warning\(s\))?$/,
    (m, n, k, e, w) => `${n} símbolo${n === '1' ? '' : 's'}, ${k} redes${e ? ` · ${e} erro(s), ${w} aviso(s)` : ''}`],
  [/^Check Schematic: (\d+) error\(s\), (\d+) warning\(s\)$/, 'Verificar Esquemático: $1 erro(s), $2 aviso(s)'],
  // the bar of the RTL / Technology Schematic (web/js/app.js): the source of the module, the status bar
  [/^Open ([\w.-]+\.(?:vhdl?|v|sv))$/, 'Abrir $1'],
  [/^Drawing (RTL|Technology) schematic of (.+)…$/, (m, k, mod) => `A desenhar o esquemático ${k === 'RTL' ? 'RTL' : 'tecnológico'} de ${mod}…`],
];
