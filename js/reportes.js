import { db, auth } from "./firebase-config.js";
import { showInfo, showLoader, hideLoader } from "./ui.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let datos = [];
let datosFiltrados = [];
let grafico = null;

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizarFecha(fecha) {
  const copia = new Date(fecha);
  copia.setHours(0, 0, 0, 0);
  return copia;
}

function cargarClientesFiltro() {
  const filtroCliente = document.getElementById("filtroCliente");
  const clientes = [...new Set(datos.map((d) => d.cliente_nombre).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));

  filtroCliente.innerHTML = '<option value="">Todos</option>';
  clientes.forEach((cliente) => {
    filtroCliente.innerHTML += `<option value="${cliente}">${cliente}</option>`;
  });
}

function renderTabla() {
  const tabla = document.getElementById("tabla");
  tabla.innerHTML = "";

  datosFiltrados.forEach((d) => {
    tabla.innerHTML += `
      <tr>
        <td>${d.codigo || "-"}</td>
        <td>${d.cliente_nombre || "-"}</td>
        <td>${d.descripcion || "-"}</td>
        <td class="text-capitalize">${d.estado || "-"}</td>
        <td>${toDate(d.fecha)?.toLocaleDateString("es-ES") || "-"}</td>
      </tr>
    `;
  });

  if (!datosFiltrados.length) {
    tabla.innerHTML = '<tr><td colspan="5" class="text-muted">No hay datos para mostrar.</td></tr>';
  }
}

function renderGrafico() {
  if (grafico) grafico.destroy();

  grafico = new Chart(document.getElementById("grafico"), {
    type: "pie",
    data: {
      labels: ["Almacén", "Tránsito", "Entregado"],
      datasets: [{
        backgroundColor: ["#1d4ed8", "#f59e0b", "#16a34a"],
        data: [
          datosFiltrados.filter((d) => d.estado === "almacen").length,
          datosFiltrados.filter((d) => d.estado === "transito").length,
          datosFiltrados.filter((d) => d.estado === "entregado").length
        ]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom"
        }
      }
    }
  });
}

function aplicarFiltros() {
  const fechaDesde = document.getElementById("fechaDesde").value;
  const fechaHasta = document.getElementById("fechaHasta").value;
  const estado = document.getElementById("filtroEstado").value;
  const cliente = document.getElementById("filtroCliente").value;

  const desde = fechaDesde ? normalizarFecha(new Date(`${fechaDesde}T00:00:00`)) : null;
  const hasta = fechaHasta ? normalizarFecha(new Date(`${fechaHasta}T00:00:00`)) : null;

  datosFiltrados = datos.filter((d) => {
    const fechaDato = toDate(d.fecha);
    const fechaNormalizada = fechaDato ? normalizarFecha(fechaDato) : null;
    return (!desde || (fechaNormalizada && fechaNormalizada >= desde))
      && (!hasta || (fechaNormalizada && fechaNormalizada <= hasta))
      && (!estado || d.estado === estado)
      && (!cliente || d.cliente_nombre === cliente);
  });

  renderTabla();
  renderGrafico();
}

async function cargar() {
  const user = auth.currentUser;
  if (!user) return;

  showLoader();
  try {
    const snap = await getDocs(query(collection(db, "envios"), where("user_id", "==", user.uid)));
    datos = snap.docs.map((d) => d.data()).sort((a, b) => {
      const aMs = a.fecha?.toMillis ? a.fecha.toMillis() : 0;
      const bMs = b.fecha?.toMillis ? b.fecha.toMillis() : 0;
      return bMs - aMs;
    });

    cargarClientesFiltro();
    aplicarFiltros();
  } finally {
    hideLoader();
  }
}

window.exportExcel = () => {
  if (!datosFiltrados.length) {
    showInfo("No hay datos para exportar.");
    return;
  }

  const filas = datosFiltrados.map((d) => ({
    codigo: d.codigo || "",
    cliente: d.cliente_nombre || "",
    descripcion: d.descripcion || "",
    estado: d.estado || "",
    fecha: toDate(d.fecha)?.toLocaleDateString("es-ES") || ""
  }));

  const ws = XLSX.utils.json_to_sheet(filas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Reporte");
  XLSX.writeFile(wb, "reporte-envios.xlsx");
};

window.exportPDF = () => {
  if (!datosFiltrados.length) {
    showInfo("No hay datos para exportar.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text("Reporte de envíos", 10, 12);

  let y = 24;
  datosFiltrados.forEach((d) => {
    doc.setFontSize(10);
    const fecha = toDate(d.fecha)?.toLocaleDateString("es-ES") || "-";
    doc.text(`${d.codigo || ""} | ${d.cliente_nombre} | ${d.estado} | ${fecha}`, 10, y);
    y += 8;
    if (y > 280) {
      doc.addPage();
      y = 15;
    }
  });

  doc.save("reporte-envios.pdf");
};

document.getElementById("fechaDesde").addEventListener("change", aplicarFiltros);
document.getElementById("fechaHasta").addEventListener("change", aplicarFiltros);
document.getElementById("filtroEstado").addEventListener("change", aplicarFiltros);
document.getElementById("filtroCliente").addEventListener("change", aplicarFiltros);

onAuthStateChanged(auth, (user) => {
  if (!user) return;
  cargar();
});
