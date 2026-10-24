import { ScatterplotLayer } from '@deck.gl/layers';

/**
 * Layer "bara" (ember): ScatterplotLayer dengan falloff Gaussian di fragment shader.
 * Dengan additive blending, titik yang menumpuk menyala dari merah -> oranye -> kuning -> putih
 * tanpa perlu menghitung heatmap di CPU atau merender ulang saat timeline bergerak.
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
          color.a *= exp(-glowD * glowD * 3.4);
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
