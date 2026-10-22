// Portuguese strings of the handwritten input (#1056: web/js/ink-dialog.js, its messages from core/ink/; merged into
// the dictionary of i18n.js).
export const INK_PT = {
  'Handwritten Expression': 'Expressão Manuscrita', 'Handwritten…': 'Manuscrita…',
  'Write the expression by hand: with a pen, a finger or the mouse': 'Escrever a expressão à mão: com uma caneta, um dedo ou o rato',
  "Write the expression with a pen, a finger or the mouse, e.g. F = A·B' + C. A bar over letters is NOT; a dot or a * is AND.":
    "Escreva a expressão com uma caneta, um dedo ou o rato, p.ex. F = A·B' + C. Uma barra sobre letras é NOT; um ponto ou um * é AND.",
  'Undo Stroke': 'Desfazer Traço', 'Recognized:': 'Reconhecido:', 'The recognized text appears here': 'O texto reconhecido aparece aqui',
  'Insert': 'Inserir',
  'Teach Silinx my handwriting': 'Ensinar ao Silinx a minha letra',
  'Write one symbol on the pad, type it here and save it: Silinx then reads your way of writing it too. The samples are kept by this browser only.':
    'Escreva um símbolo na área de escrita, escreva-o aqui e guarde-o: o Silinx passa a ler também a sua maneira de o escrever. As amostras ficam só neste navegador.',
  'Symbol:': 'Símbolo:', 'The symbol written on the pad': 'O símbolo escrito na área de escrita',
  'Save Sample': 'Guardar Amostra', 'Forget My Samples': 'Esquecer as Minhas Amostras',
  'Write the symbol on the pad first.': 'Escreva primeiro o símbolo na área de escrita.',
  'Your samples were forgotten.': 'As suas amostras foram esquecidas.',
  'The browser did not keep the sample (storage unavailable).': 'O navegador não guardou a amostra (armazenamento indisponível).',
  "Write an expression, e.g. F = A·B' + C.": "Escreva uma expressão, p.ex. F = A·B' + C.",
  'Nothing written: write the expression on the pad.': 'Nada escrito: escreva a expressão na área de escrita.',
  "More than one '=': only the first one separates the name from the expression.": "Mais de um '=': só o primeiro separa o nome da expressão.",
  // New Source: a truth table from an expression
  'Expression:': 'Expressão:', "optional, e.g. F = A·B' + C": "opcional, p.ex. F = A·B' + C",
};

export const INK_PT_PATTERNS = [
  [/^Samples of your handwriting: (\d+)$/, 'Amostras da sua letra: $1'],
  [/^Sample of '(.+)' saved\.$/, "Amostra de '$1' guardada."],
  [/^Type one symbol of the set: (.+)$/, 'Escreva um símbolo do conjunto: $1'],
  [/^A symbol was not recognized \(shown as \?\): write it again, or teach Silinx your handwriting\.$/, 'Um símbolo não foi reconhecido (mostrado como ?): escreva-o de novo, ou ensine ao Silinx a sua letra.'],
  [/^(\d+) symbols were not recognized \(shown as \?\): write them again, or teach Silinx your handwriting\.$/, '$1 símbolos não foram reconhecidos (mostrados como ?): escreva-os de novo, ou ensine ao Silinx a sua letra.'],
  [/^Expression: 1 to (\d+) inputs \(it has (\d+)\)\.$/, 'Expressão: 1 a $1 entradas (tem $2).'],
  [/^Expression: '(.+)' is not a valid output name\.$/, "Expressão: '$1' não é um nome de saída válido."],
  [/^Expression: the output '(.+)' is also an input\.$/, "Expressão: a saída '$1' é também uma entrada."],
  [/^Expression: (.+)$/, 'Expressão: $1'],
];
