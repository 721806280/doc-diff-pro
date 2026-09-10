import { alignSequences } from './tableAlignment';

type Equation = { element: Element; signature: string };
type MathSignature = string | [string, Array<[string, string]>, MathSignature[]];
const PRESENTATION_ATTRIBUTES = new Set(['xmlns', 'display', 'style', 'class', 'id']);

/** Compare complete equations and keep HTML difference markers outside MathML. */
export function markMathDifferences(originalRoot: HTMLElement, revisedRoot: HTMLElement): void {
  const original = collectEquations(originalRoot);
  const revised = collectEquations(revisedRoot);
  const pairs = alignSequences(original, revised, (left, right) => (left.signature === right.signature ? 1 : 0), {
    matchThreshold: 0,
    gapPenalty: 0.2,
    maxPairs: 250_000
  });

  pairs.forEach((pair, index) => {
    if (pair.original?.signature === pair.revised?.signature) return;

    const id = `math-${index + 1}`;
    if (pair.original) wrapEquation(pair.original.element, 'del', id);
    if (pair.revised) wrapEquation(pair.revised.element, 'ins', id);
  });
}

function collectEquations(root: HTMLElement): Equation[] {
  return Array.from(root.querySelectorAll('math'))
    .filter((element) => !element.parentElement?.closest('math'))
    .map((element) => ({ element, signature: JSON.stringify(mathSignature(element)) }));
}

function mathSignature(node: Node): MathSignature {
  if (node.nodeType === Node.TEXT_NODE) return (node.nodeValue ?? '').replace(/\u00a0/g, ' ');
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const element = node as Element;
  const attributes = Array.from(element.attributes)
    .filter((attribute) => !PRESENTATION_ATTRIBUTES.has(attribute.name))
    .map((attribute): [string, string] => [attribute.name, attribute.value])
    .sort(([left], [right]) => left.localeCompare(right));
  // Pretty-printing between arguments is not mathematical content. Spaces
  // inside token elements, especially mtext, still belong to the equation.
  const children = Array.from(element.childNodes).filter(
    (child) =>
      child.nodeType !== Node.TEXT_NODE ||
      /^(mi|mn|mo|mtext|ms)$/.test(element.localName) ||
      /\S/.test(child.nodeValue ?? '')
  );
  return [element.localName, attributes, children.map(mathSignature)];
}

function wrapEquation(equation: Element, tag: 'del' | 'ins', id: string): void {
  const wrapper = equation.ownerDocument.createElement(tag);
  wrapper.dataset.diffId = id;
  equation.replaceWith(wrapper);
  wrapper.appendChild(equation);
}
