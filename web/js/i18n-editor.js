// Portuguese strings of the HDL editor's refactoring and quick fixes (merged into the dictionary of
// i18n.js): Rename Symbol (F2).

const KIND_PT = {
  'entity': 'entidade', 'architecture': 'arquitetura', 'package': 'pacote', 'configuration': 'configuração', 'component': 'componente', 'module': 'módulo',
  'port': 'porto', 'generic': 'genérico', 'parameter': 'parâmetro', 'signal': 'sinal', 'variable': 'variável', 'constant': 'constante', 'file': 'ficheiro',
  'alias': 'alias', 'type': 'tipo', 'subtype': 'subtipo', 'literal': 'literal', 'field': 'campo', 'attribute': 'atributo', 'argument': 'argumento',
  'function': 'função', 'procedure': 'procedimento', 'task': 'tarefa', 'label': 'etiqueta', 'instance': 'instância', 'loop variable': 'variável de ciclo',
  'genvar': 'genvar', 'name': 'nome',
};
const kindPt = k => KIND_PT[k] || k;
const places = (n, w) => `${n} ${{ place: 'sítio', places: 'sítios', file: 'ficheiro', files: 'ficheiros' }[w]}`;

export const EDITOR_PT = {
  'Rename Symbol…': 'Mudar o Nome do Símbolo…', 'Rename Symbol': 'Mudar o Nome do Símbolo', 'New name:': 'Novo nome:',
  'There is no name to rename here.': 'Não há aqui nenhum nome a mudar.',
  'Rename symbol': 'Mudar o nome do símbolo',
};

export const EDITOR_PT_PATTERNS = [
  [/^Renames the (.+?) '(.+)' everywhere it is used in this file: (\d+) (places?)\.$/, (m, k, n, c, w) => `Muda o nome de '${n}' (${kindPt(k)}) em todos os sítios onde é usado neste ficheiro: ${places(c, w)}.`],
  [/^Also in the instances of '(.+)' in the other files \((.+)\)$/, "Também nas instâncias de '$1' nos outros ficheiros ($2)"],
  [/^No other file of the project instantiates '(.+)'\.$/, "Nenhum outro ficheiro do projeto instancia '$1'."],
  [/^Not changed: the instances of '(.+)' in (.+) \(made from the drawing: change them there\)\.$/, "Não mudam: as instâncias de '$1' em $2 (feitas a partir do desenho: mude-as lá)."],
  [/^'(.+)' is a port of '(.+)', declared in another file: rename it there\.$/, "'$1' é um porto de '$2', declarado noutro ficheiro: mude-lhe o nome lá."],
  [/^'(.+)' is not declared in this file: rename it where it is declared\.$/, "'$1' não está declarado neste ficheiro: mude-lhe o nome onde está declarado."],
  [/^'(.*)' is not a valid Verilog name: a letter or _ first, then letters, digits, _ or \$\.$/, "'$1' não é um nome Verilog válido: primeiro uma letra ou _, depois letras, algarismos, _ ou $$."],
  [/^'(.*)' is not a valid VHDL name: a letter first, then letters, digits and single underscores \(not at the end\)\.$/, "'$1' não é um nome VHDL válido: primeiro uma letra, depois letras, algarismos e _ simples (não no fim)."],
  [/^'(.+)' is a reserved word of (VHDL|Verilog)\.$/, "'$1' é uma palavra reservada do $2."],
  [/^'(.+)' is already declared here \((.+?) '(.+)'\): choose another name\.$/, (m, n, k, o) => `'${n}' já está declarado aqui (${kindPt(k)} '${o}'): escolha outro nome.`],
  [/^'(.+)' is already used for another object where '(.+)' is visible: choose another name\.$/, "'$1' já é usado para outro objeto onde '$2' é visível: escolha outro nome."],
  [/^Renamed '(.+)' to '(.+)' \((\d+) (places?)\)\.$/, (m, a, b, n, w) => `'${a}' passou a '${b}' (${places(n, w)}).`],
  [/^Renamed '(.+)' to '(.+)': (\d+) in this file, and in (\d+) other (files?)\.$/, (m, a, b, n, f, w) => `'${a}' passou a '${b}': ${n} neste ficheiro, e em mais ${places(f, w)}.`],
];
