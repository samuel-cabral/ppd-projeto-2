/**
 * Tabuleiro SVG 9x5.
 *
 * O ponto que a interface precisa acertar: cada celula tem UMA diagonal, nao
 * um X. Desenhar X em todas transformaria todo ponto em forte e a geometria
 * do jogo inteira mudaria (docs/01-visao-de-produto.md secao 2).
 */
import type { Cell, Color, Move, Point } from '../shared/protocol.js';
import { cellDiagonal } from '../engine/board.js';

const COLS = 9;
const ROWS = 5;
const STEP = 84;
const PAD = 46;
const W = (COLS - 1) * STEP + PAD * 2;
const H = (ROWS - 1) * STEP + PAD * 2;

const point = (col: number, row: number): Point => String.fromCharCode(96 + col) + row;

const isStrong = (col: number, row: number) => (col + row) % 2 === 0;

/**
 * Cada jogador ve as proprias pecas embaixo. Isso e feito espelhando as
 * COORDENADAS, e nao girando o SVG com CSS: com a rotacao, os rotulos a-i e
 * 1-5 continuavam no lugar antigo e passavam a apontar para a fileira errada.
 */
function axes(flipped: boolean) {
  const x = (col: number) => PAD + (flipped ? COLS - col : col - 1) * STEP;
  const y = (row: number) => PAD + (flipped ? row - 1 : ROWS - row) * STEP;
  return { x, y };
}

export interface BoardProps {
  board: Cell[];
  myColor: Color | null;
  selected: Point | null;
  /** Lances que partem da peca selecionada, agrupados por destino. */
  destinations: Map<Point, Move[]>;
  /** Pecas que caem se o lance sob o cursor for jogado. */
  doomed: Point[];
  lockedTo: Point | null;
  onPointClick: (p: Point) => void;
  onHover: (p: Point | null) => void;
}

export function Board(props: BoardProps) {
  const { board, myColor, selected, destinations, doomed, lockedTo } = props;
  const flipped = myColor === 'B';
  const { x, y } = axes(flipped);

  const lines: React.ReactNode[] = [];
  for (let row = 1; row <= ROWS; row++) {
    lines.push(
      <line key={`h${row}`} x1={x(1)} y1={y(row)} x2={x(COLS)} y2={y(row)} className="grid" />,
    );
  }
  for (let col = 1; col <= COLS; col++) {
    lines.push(
      <line key={`v${col}`} x1={x(col)} y1={y(1)} x2={x(col)} y2={y(ROWS)} className="grid" />,
    );
  }
  // Uma diagonal por celula, alternando — o mosaico de triangulos.
  for (let col = 1; col < COLS; col++) {
    for (let row = 1; row < ROWS; row++) {
      const slash = cellDiagonal(col, row) === '/';
      lines.push(
        <line
          key={`d${col}-${row}`}
          x1={slash ? x(col) : x(col + 1)}
          y1={slash ? y(row) : y(row)}
          x2={slash ? x(col + 1) : x(col)}
          y2={slash ? y(row + 1) : y(row + 1)}
          className="grid"
        />,
      );
    }
  }

  const nodes: React.ReactNode[] = [];
  for (let col = 1; col <= COLS; col++) {
    for (let row = 1; row <= ROWS; row++) {
      const p = point(col, row);
      const i = (row - 1) * COLS + (col - 1);
      const piece = board[i];
      const moves = destinations.get(p);
      const cx = x(col);
      const cy = y(row);

      nodes.push(
        <g
          key={p}
          transform={`translate(${cx} ${cy})`}
          onClick={() => props.onPointClick(p)}
          onMouseEnter={() => props.onHover(p)}
          onMouseLeave={() => props.onHover(null)}
          className="node"
        >
          <circle r={isStrong(col, row) ? 5 : 3.5} className="dot" />

          {piece && (
            <circle
              r={24}
              className={[
                'piece',
                piece === 'W' ? 'white' : 'black',
                selected === p ? 'selected' : '',
                lockedTo === p ? 'locked' : '',
                doomed.includes(p) ? 'doomed' : '',
              ].join(' ')}
            />
          )}

          {moves && <DestinationMark moves={moves} />}

          <title>{p}</title>
        </g>,
      );
    }
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="board">
      <rect x={0} y={0} width={W} height={H} rx={12} className="felt" />
      {lines}
      {nodes}
      {Array.from({ length: COLS }, (_, i) => (
        <text key={`lc${i}`} x={x(i + 1)} y={H - 12} className="label">
          {String.fromCharCode(97 + i)}
        </text>
      ))}
      {Array.from({ length: ROWS }, (_, i) => (
        <text key={`lr${i}`} x={18} y={y(i + 1) + 5} className="label">
          {i + 1}
        </text>
      ))}
    </svg>
  );
}

/**
 * Marcador do destino, distinto por tipo (requisito 4 da lista de tela).
 * Quando o mesmo destino aceita aproximacao E afastamento, o anel aparece
 * dividido — e o aviso de que a escolha vai ser pedida.
 */
function DestinationMark({ moves }: { moves: Move[] }) {
  const kinds = new Set(moves.map((m) => m.kind));
  const ambiguous = kinds.has('A') && kinds.has('W');
  const kind = ambiguous ? 'AW' : [...kinds][0];
  return (
    <g className={`dest dest-${kind}`}>
      <circle r={20} className="dest-ring" />
      {ambiguous && <line x1={0} y1={-20} x2={0} y2={20} className="dest-split" />}
      {kind === 'P' && <circle r={6} className="dest-core" />}
    </g>
  );
}
