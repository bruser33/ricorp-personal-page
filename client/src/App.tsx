import { useState } from 'react';
import { Splash } from './components/Splash';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { Projects } from './components/Projects';
import { News } from './components/News';
import { Contact } from './components/Contact';
import { Footer } from './components/Footer';
import { useReveal } from './hooks/useReveal';
import './App.css';

export default function App() {
  const [siteReady, setSiteReady] = useState(false);
  useReveal(siteReady);

  return (
    <>
      <Splash onDone={() => setSiteReady(true)} />
      <div className={siteReady ? 'site-ready' : 'site-pre'} aria-hidden={!siteReady}>
        <Header />
        <main>
          <Hero startAnim={siteReady} />
          <Projects />
          <News />
          <Contact />
        </main>
        <Footer />
      </div>
    </>
  );
}
