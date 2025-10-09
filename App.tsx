import React from 'react';
import Dashboard from './components/Dashboard.tsx';
import Store from './components/Store.tsx';
// Fix: Import routing components from 'react-router-dom' instead of accessing them from the window object.
import { HashRouter, Routes, Route } from 'react-router-dom';

const App: React.FC = () => {
  return (
    <HashRouter>
      <Routes>
        <Route path="/store" element={<Store />} />
        <Route path="/" element={<Dashboard />} />
      </Routes>
    </HashRouter>
  );
};

export default App;
