import React from 'react';
import App from '../src/App';

/**
 * O expo-router exige um componente React como export default desta rota.
 * Reexport `export { default } from` não é sempre reconhecido pelo getRoutes.
 */
export default function Index(): React.ReactElement {
  return <App />;
}
