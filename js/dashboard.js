import { db, auth } from "./firebase-config.js";
import { showLoader, hideLoader } from "./ui.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let graficoEstados = null;
let graficoEnviosDia = null;
let graficoFechas = null;

function formatoMoneda(valor) {
  return new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2
  }).format(valor);
}

function normalizarFecha(fecha) {
  if (!fecha) return null;
  if (typeof fecha.toDate === "function") return fecha.toDate();
  const parsed = new Date(fecha);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function claveFecha(fecha) {
  return fecha.toISOString().slice(0, 10);
}

function etiquetaFechaISO(claveISO) {
  const [anio, mes, dia] = claveISO.split("-");
  return `${dia}/${mes}/${anio}`;
}

async function cargarDashboard() {
  const user = auth.currentUser;
  if (!user) return;

  showLoader();
  try {
    const clientes = await getDocs(query(collection(db, "clientes"), where("user_id", "==", user.uid)));
    document.getElementById("clientes").innerText = clientes.size;

    const envios = await getDocs(query(collection(db, "envios"), where("user_id", "==", user.uid)));

    let almacen = 0;
    let transito = 0;
    let entregado = 0;
    let ingresos = 0;

    const enviosPorDia = {};
    const ingresosPorFecha = {};

    envios.forEach((doc) => {
      const d = doc.data();
      if (d.estado === "almacen") almacen++;
      if (d.estado === "transito") transito++;
      if (d.estado === "entregado") entregado++;

      const precio = Number(d.precio) || 0;
      ingresos += precio;

      const fechaBase = normalizarFecha(d.fecha_envio) || normalizarFecha(d.fecha);
      if (!fechaBase) return;

      const fechaClave = claveFecha(fechaBase);
      enviosPorDia[fechaClave] = (enviosPorDia[fechaClave] || 0) + 1;
      ingresosPorFecha[fechaClave] = (ingresosPorFecha[fechaClave] || 0) + precio;
    });

    document.getElementById("transito").innerText = transito;
    document.getElementById("entregado").innerText = entregado;
    document.getElementById("ingresos").innerText = formatoMoneda(ingresos);

    if (graficoEstados) graficoEstados.destroy();
    if (graficoEnviosDia) graficoEnviosDia.destroy();
    if (graficoFechas) graficoFechas.destroy();

    graficoEstados = new Chart(document.getElementById("graficoEstados"), {
      type: "bar",
      data: {
        labels: ["Almacén", "Tránsito", "Entregado"],
        datasets: [{
          label: "Envíos por estado",
          backgroundColor: ["#1d4ed8", "#f59e0b", "#16a34a"],
          borderRadius: 8,
          maxBarThickness: 82,
          data: [almacen, transito, entregado]
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.parsed.y} envíos` } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { weight: "600" } } },
          y: { beginAtZero: true, ticks: { precision: 0 } }
        }
      }
    });

    const fechasOrdenadasEnvios = Object.keys(enviosPorDia).sort();
    graficoEnviosDia = new Chart(document.getElementById("graficoEnviosDia"), {
      type: "bar",
      data: {
        labels: fechasOrdenadasEnvios.map(etiquetaFechaISO),
        datasets: [{ label: "Envíos", backgroundColor: "#2563eb", borderRadius: 6, data: fechasOrdenadasEnvios.map((f) => enviosPorDia[f]) }]
      }
    });

    const fechasOrdenadasIngresos = Object.keys(ingresosPorFecha).sort();
    graficoFechas = new Chart(document.getElementById("graficoFechas"), {
      type: "line",
      data: {
        labels: fechasOrdenadasIngresos.map(etiquetaFechaISO),
        datasets: [{ label: "Ingresos", data: fechasOrdenadasIngresos.map((f) => ingresosPorFecha[f]), borderColor: "#0f766e", backgroundColor: "rgba(15, 118, 110, 0.15)", fill: true, tension: 0.25 }]
      }
    });
  } finally {
    hideLoader();
  }
}

onAuthStateChanged(auth, (user) => {
  if (!user) return;
  cargarDashboard();
});
