import { Planner } from "@/components/Planner";

export default function Home() {
  return (
    <main className="page">
      <header className="masthead">
        <p className="brand">NorbApp Fuel</p>
        <h1>Útiköltség-kalkulátor</h1>
        <p className="muted">
          Útvonal, tankolási pontok és matricák egy helyen. Élő kútárak Németországban és Ausztriában.
        </p>
      </header>
      <Planner />
      <footer className="footer muted small">
        Az árak tájékoztató jellegűek. Térképadatok ©{" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
          OpenStreetMap
        </a>{" "}
        közreműködők · Útvonal: OSRM · Címkeresés: Photon · Kútárak: Tankerkönig (CC BY 4.0), E-Control.
      </footer>
    </main>
  );
}
