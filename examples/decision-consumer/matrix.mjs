import { encodeDocument } from '@alica/decision-phase4/contract';
export function matrix() {
  const d = encodeDocument;
  const state = d({ text: 'A fresh disposable blue square on white paper.', numericWeight: { $decisionDecimal: '0.125' }, literalWeight: '0.125' });
  const questions = [
    { name: 'is_blue', kind: 'boolean', instructions: d({ task: 'Is the described square blue?' }) },
    { name: 'color', kind: 'choice', instructions: d({ task: 'Select the described color.' }), options: [
      { id: 'blue', description: d({ text: 'Blue' }) }, { id: 'red', description: d({ text: 'Red' }) } ] },
    { name: 'blueness', kind: 'score', instructions: d({ task: 'Rate whether the square is blue, using these two ordered levels.' }), levels: [
      { id: 'low', value: '0', description: d({ text: 'Not blue', threshold: { $decisionDecimal: '0.125' } }) },
      { id: 'high', value: '1', description: d({ text: 'Blue' }) } ] },
  ];
  return [...questions.map(q => ({ state, questions: [q] })), { state, questions }];
}
