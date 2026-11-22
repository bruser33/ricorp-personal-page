import StylesManager from '../../agenda/components/StylesManager';

// /wstyle/admin/estilos/ (SPEC-59): el catálogo de fotos de estilos. Subir varias, editar nombre y categoría,
// reordenar, ocultar/mostrar y eliminar cualquiera (moderación).
export default function StylesPage() {
  return (
    <>
      <h1 className="ag-h1">Estilos</h1>
      <section className="ag-card">
        <StylesManager admin />
      </section>
    </>
  );
}
