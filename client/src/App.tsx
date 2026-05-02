import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { Projects } from './components/Projects';
import { News } from './components/News';
import { Contact } from './components/Contact';
import { Footer } from './components/Footer';
import './App.css';

export default function App() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Projects />
        <News />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
