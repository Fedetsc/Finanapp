"use client";

/** <select> que envía su formulario (GET) apenas cambia: para filtros sin botón "Aplicar". */
export default function AutoSubmitSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
