// The turntable, as an AudioWorklet. All five disc loops play from one shared read head,
// so they stay in step whatever happens to the speed. `rate` moves the head (1 is normal,
// 0 stops, negative runs backwards for a scratch); `mix` is the carousel position, and the
// two loops either side of it are blended with an equal-power crossfade.
class Deck extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "rate", defaultValue: 0, minValue: -4, maxValue: 4 },
      { name: "mix", defaultValue: 0, minValue: 0, maxValue: 64 },
    ];
  }

  constructor() {
    super();
    this.tracks = [];
    this.length = 0;
    this.head = 0;
    this.port.onmessage = ({ data }) => {
      if (data.type !== "track") return;
      this.tracks[data.i] = data.channels;
      this.length = data.channels[0].length;
    };
  }

  process(inputs, outputs, params) {
    const L = outputs[0][0];
    const R = outputs[0][1] || L;
    const len = this.length;
    if (!len) return true;
    const rates = params.rate;
    const mixes = params.mix;
    const HALF_PI = Math.PI / 2;
    let h = this.head;
    for (let k = 0; k < L.length; k++) {
      const mix = mixes.length > 1 ? mixes[k] : mixes[0];
      const a = Math.floor(mix);
      const w = mix - a;
      const ta = this.tracks[a];
      const tb = w > 0 ? this.tracks[a + 1] : null;
      const ga = Math.cos(w * HALF_PI);
      const gb = Math.sin(w * HALF_PI);
      const i0 = Math.floor(h);
      const f = h - i0;
      const i1 = i0 + 1 === len ? 0 : i0 + 1;
      let l = 0;
      let r = 0;
      if (ta) {
        l += ga * (ta[0][i0] + (ta[0][i1] - ta[0][i0]) * f);
        r += ga * (ta[1][i0] + (ta[1][i1] - ta[1][i0]) * f);
      }
      if (tb) {
        l += gb * (tb[0][i0] + (tb[0][i1] - tb[0][i0]) * f);
        r += gb * (tb[1][i0] + (tb[1][i1] - tb[1][i0]) * f);
      }
      L[k] = l;
      R[k] = r;
      h += rates.length > 1 ? rates[k] : rates[0];
      if (h >= len) h -= len;
      else if (h < 0) h += len;
    }
    this.head = h;
    return true;
  }
}

registerProcessor("deck", Deck);
