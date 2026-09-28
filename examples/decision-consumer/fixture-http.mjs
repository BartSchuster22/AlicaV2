// Explicitly synthetic HTTP primitive for offline operator integration only.
// It exercises real provider/transport/parser/ledger code; never LIVE-OBSERVED.
import { EventEmitter } from 'node:events';
export function fixtureHTTPS(calls) {
  return (options, callback) => {
    const req = new EventEmitter(); req.destroy = () => {};
    req.end = body => {
      calls.push({ method: options.method, path: options.path });
      queueMicrotask(() => {
        let result;
        if (options.path === '/v1/models') result = { models: [{ name: 'fixture-alias', description: 'Explicit synthetic model', release_date: '2026-09-01' }] };
        else {
          const input = JSON.parse(body), answers = {};
          for (const [name,q] of Object.entries(input.questions)) {
            if (q.type === 'noul') answers[name] = { type: 'noul', noul: 0.734928 };
            if (q.type === 'choice') {
              const ids = Object.keys(q.criteria);
              answers[name] = { type: 'choice', choice: ids[0], confidence: 0.8, probabilities: { [ids[0]]: 0.75, [ids[1]]: 0.25 } };
            }
            if (q.type === 'score') answers[name] = { type: 'score', score: 0.75, confidence: 0.8, probabilities: { '0': 0.25, '1': 0.75 }, legend: Object.fromEntries(q.criteria.map((v,i) => [String(i),v])) };
          }
          result = { model: 'fixture-resolved', answers, usage: { input_tokens: 123, output_tokens: 17 } };
        }
        const res = new EventEmitter(); res.statusCode = 200; res.headers = { 'content-type': 'application/json' }; res.destroy = () => {};
        callback(res); res.emit('data', Buffer.from(JSON.stringify(result))); res.emit('end');
      });
    };
    return req;
  };
}
