import { ScatterplotLayer } from '@deck.gl/layers';

/**
 * Layer "bara" (ember): ScatterplotLayer dengan falloff Gaussian di fragment shader.
 * Warna titik mewakili intensitas/frekuensi kemunculan hotspot di wilayah tersebut
 * (Merah Tua -> Oranye -> Kuning -> Putih Pijar).
 * Dengan additive blending, area dengan akumulasi titik api tinggi menyala semakin terang.
 */
export default class GlowLayer extends ScatterplotLayer {
  static layerName = 'GlowLayer';

  getShaders() {
    const shaders = super.getShaders();
    return {
      ...shaders,
      inject: {
        ...(shaders.inject || {}),
        'fs:DECKGL_FILTER_COLOR': `
          float glowD = length(geometry.uv);
          if (glowD > 1.0) discard;
          float falloff = exp(-glowD * glowD * 3.4);
          color.a *= falloff;
        `,
      },
    };
  }
}

/** Additive blending, tanpa depth test (agar titik bertumpuk menjumlah, bukan saling tutup). */
export const ADDITIVE_PARAMS = {
  depthCompare: 'always',
  depthWriteEnabled: false,
  blend: true,
  blendColorOperation: 'add',
  blendColorSrcFactor: 'src-alpha',
  blendColorDstFactor: 'one',
  blendAlphaOperation: 'add',
  blendAlphaSrcFactor: 'one',
  blendAlphaDstFactor: 'one',
};
