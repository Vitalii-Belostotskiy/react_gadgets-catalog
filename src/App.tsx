import React from 'react';
import './App.scss';
import './utils/resetStyles.css';
import { Header } from './components/Header';
import { Outlet } from 'react-router-dom';
import { Footer } from './components/Footer';

export const App: React.FC = () => {
  return (
    <div className="App">
      <Header />
      <Outlet />
      <Footer />
    </div>
  );
};
