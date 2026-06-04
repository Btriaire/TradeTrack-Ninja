import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    // Augmente le seuil d'avertissement (les splits vendor sont intentionnellement grands)
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // ── Vendor splitting : chaque lib dans son propre chunk ────────────
        // Permet au navigateur de mettre en cache les librairies séparément
        // et de ne re-télécharger que le code app en cas de mise à jour.
        manualChunks: {
          // React + DOM (ne change presque jamais)
          'vendor-react': ['react', 'react-dom'],
          // State management & queries (change peu)
          'vendor-query': ['@tanstack/react-query'],
          // Graphiques (lourd — ~250KB seul)
          'vendor-charts': ['lightweight-charts'],
          // Icônes (peut grossir)
          'vendor-icons': ['lucide-react'],
          // Firebase (auth + firestore)
          'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          // Utilitaires
          'vendor-misc': ['axios', 'clsx'],
        },
      },
    },
  },
})
