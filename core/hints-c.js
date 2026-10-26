// Plain-language help (English and Portuguese) for the messages of Silinx C's checks (core/c-check.js, #1524), in the
// form of core/hints.js's HINTS, which lists them: what the message means and how to fix it.

export const C_HINTS = [
  {
    id: 'c-recursion', re: /^recursion is not possible in hardware/,
    en: { explain: 'A function calls itself, directly or through others. Hardware has a fixed number of copies of each function: it cannot make a new copy for every call, so Vitis HLS and Silinx C refuse recursion.',
      fix: 'Write it as a loop with a fixed bound (a for from a constant to a constant), keeping in variables what the recursive calls kept.' },
    pt: { explain: 'Uma função chama-se a si própria, diretamente ou através de outras. O hardware tem um número fixo de cópias de cada função: não pode fazer uma cópia nova a cada chamada, por isso o Vitis HLS e o Silinx C recusam a recursão.',
      fix: 'Escreva-a como um ciclo com limite fixo (um for de uma constante a uma constante), guardando em variáveis o que as chamadas recursivas guardavam.' },
  },
  {
    id: 'c-dynamic-memory', re: /^(malloc|calloc|realloc|free): dynamic memory/,
    en: { explain: '$1 asks for memory while the program runs. A circuit has all its memory from the start: its size must be known when it is made.',
      fix: 'Declare an array of the largest size needed (a constant), and use part of it.' },
    pt: { explain: '$1 pede memória enquanto o programa corre. Um circuito tem toda a sua memória desde o início: o tamanho tem de ser conhecido quando é feito.',
      fix: 'Declare um array com o maior tamanho necessário (uma constante) e use só parte dele.' },
  },
  {
    id: 'c-system-call', re: /^(\w+) is a system call/,
    en: { explain: '$1 asks the operating system for something. There is no operating system inside the circuit: the whole behaviour must be in the function and the functions it calls.',
      fix: 'Remove the call from the synthesized function; if it is needed for testing, call it in main() (the test bench).' },
    pt: { explain: '$1 pede algo ao sistema operativo. Dentro do circuito não há sistema operativo: todo o comportamento tem de estar na função e nas funções que ela chama.',
      fix: 'Retire a chamada da função sintetizada; se for precisa para testar, chame-a em main() (o test bench).' },
  },
  {
    id: 'c-pointer-variable', re: /a pointer variable is not possible/,
    en: { explain: 'In Silinx C (as in Vitis HLS) a pointer is only a way for an argument to give a result back: there is no memory with addresses inside the circuit for a pointer variable to point into.',
      fix: 'Use an array and an index (a[i]) instead of a pointer that moves.' },
    pt: { explain: 'No Silinx C (como no Vitis HLS) um apontador é só uma forma de um argumento devolver um resultado: dentro do circuito não há uma memória com endereços para onde uma variável apontador possa apontar.',
      fix: 'Use um array e um índice (a[i]) em vez de um apontador que se move.' },
  },
  {
    id: 'c-pointer-arithmetic', re: /^pointer arithmetic is not possible/,
    en: { explain: 'p + 1 moves a pointer to the next element: Silinx C reads arrays by their index only.',
      fix: 'Write p[1] instead of *(p + 1).' },
    pt: { explain: 'p + 1 move um apontador para o elemento seguinte: o Silinx C só lê arrays pelo índice.',
      fix: 'Escreva p[1] em vez de *(p + 1).' },
  },
  {
    id: 'c-float', re: /floating point \((.+)\) is not supported in Silinx C yet/,
    en: { explain: 'Floating-point numbers ($1) need large arithmetic units; Silinx C works with integers for now.',
      fix: 'Use integers scaled by a power of 2 (e.g. the value × 256), or ap_int<W> / ap_uint<W> of the width you need.' },
    pt: { explain: 'Os números de vírgula flutuante ($1) precisam de unidades aritméticas grandes; por agora o Silinx C trabalha com inteiros.',
      fix: 'Use inteiros multiplicados por uma potência de 2 (p. ex. o valor × 256), ou ap_int<W> / ap_uint<W> com a largura de que precisa.' },
  },
  {
    id: 'c-loop-bound', re: /^the number of iterations of this loop is not known/,
    en: { explain: 'The circuit is made before it runs: Silinx C must know how many times a loop can run at most, to know how long a call takes and how many resources it needs.',
      fix: "Write it as 'for (int i = 0; i < N; i++)' with N a constant and i not changed inside the loop; or, when the count depends on the inputs, add #pragma HLS LOOP_TRIPCOUNT max=N as the loop's first line." },
    pt: { explain: 'O circuito é feito antes de correr: o Silinx C tem de saber quantas vezes um ciclo pode correr no máximo, para saber quanto tempo demora uma chamada e quantos recursos precisa.',
      fix: "Escreva-o como 'for (int i = 0; i < N; i++)' com N uma constante e i sem ser mudado dentro do ciclo; ou, quando o número depende das entradas, acrescente #pragma HLS LOOP_TRIPCOUNT max=N na primeira linha do ciclo." },
  },
  {
    id: 'c-header', re: /^the header '(.+)' is not one of Silinx C's/,
    en: { explain: "$1 is a header of the C library for programs on a computer; its functions do not exist in a circuit.",
      fix: 'Keep the headers Silinx C knows: ap_int.h (ap_int<W>, ap_uint<W>), stdint.h, stdbool.h and stdio.h (printf, for the test bench).' },
    pt: { explain: '$1 é um ficheiro da biblioteca de C para programas num computador; as suas funções não existem num circuito.',
      fix: 'Fique pelos ficheiros que o Silinx C conhece: ap_int.h (ap_int<W>, ap_uint<W>), stdint.h, stdbool.h e stdio.h (printf, para o test bench).' },
  },
  {
    id: 'c-printf', re: /^(printf|fprintf|puts|putchar) is ignored by synthesis/,
    en: { explain: '$1 prints on the computer: in C simulation it works, but the circuit has no screen, so synthesis leaves it out.',
      fix: 'Nothing to do if it is only for testing; to see a value in hardware, give it a port (a pointer argument).' },
    pt: { explain: '$1 escreve no computador: na simulação de C funciona, mas o circuito não tem ecrã, por isso a síntese deixa-o de fora.',
      fix: 'Nada a fazer se for só para testar; para ver um valor no hardware, dê-lhe um porto (um argumento apontador).' },
  },
];
