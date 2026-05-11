import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

function Root() {
  return (
    <React.Suspense fallback={<div style={{color:'#fff',padding:40,textAlign:'center'}}>Loading Meluri...</div>}>
      <App />
    </React.Suspense>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
