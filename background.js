import { startBackgroundApplication } from './src/composition/background.js';

// Każde uruchomienie skryptu usługi przez Chrome tworzy jedną aplikację skanera.
startBackgroundApplication();
