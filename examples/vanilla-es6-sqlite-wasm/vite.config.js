import viteCompression from 'vite-plugin-compression';

export default () => {
  return {
    plugins: [viteCompression({
      filter: /\.(js|mjs|json|css|html|wasm)$/i
    })],
  };
};
