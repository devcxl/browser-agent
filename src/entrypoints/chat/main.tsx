import React from 'react';
import ReactDOM from 'react-dom/client';

function App() {
  return <div className="p-4 text-lg">Browser Agent</div>;
}

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
