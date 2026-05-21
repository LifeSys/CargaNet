import { db, auth } from "./firebase-config.js";
import { showError, showLoader, hideLoader, showValidationErrors, toast, confirmDelete } from "./ui.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  getDoc,
  doc,
  query,
  Timestamp,
  arrayUnion,
  where,
  deleteDoc,
  limit
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let enviosData = [];

function toTimestamp(dateValue) {
  if (!dateValue) return null;
  return Timestamp.fromDate(new Date(`${dateValue}T00:00:00`));
}

function generarTracking(uid) {
  const base = Date.now().toString(36).toUpperCase();
  return `CN-${uid.slice(0, 4).toUpperCase()}-${base}`;
}

function getDateInputValue(value) {
  if (!value) return "";
  if (typeof value.toDate === "function") return value.toDate().toISOString().slice(0, 10);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

async function generarCodigoEnvio(uid) {
  let codigo = "";
  let existe = true;

  while (existe) {
    codigo = generarTracking(uid);
    const snap = await getDocs(query(collection(db, "envios"), where("codigo", "==", codigo), limit(1)));
    existe = !snap.empty;
  }

  return codigo;
}

async function cargarClientes() {
  const user = auth.currentUser;
  if (!user) return;

  const snap = await getDocs(query(collection(db, "clientes"), where("user_id", "==", user.uid)));
  const select = document.getElementById("clienteSelect");

  select.innerHTML = '<option value="">Selecciona un cliente</option>';

  snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es"))
    .forEach((d) => {
      select.innerHTML += `<option value="${d.id}">${d.nombre}</option>`;
    });
}

function limpiarFormulario() {
  [
    "descripcion", "destinatarioNombre", "destinatarioTelefono", "destinatarioDireccion",
    "precio", "fechaEnvio", "fechaEntrega"
  ].forEach((id) => {
    document.getElementById(id).value = "";
  });
  document.getElementById("clienteSelect").value = "";
}

window.crearEnvio = async function () {
  const user = auth.currentUser;
  const select = document.getElementById("clienteSelect");

  if (!user) {
    await showError("Tu sesión no está activa. Vuelve a iniciar sesión.");
    return;
  }

  const payload = {
    clienteId: select.value,
    clienteNombre: select.selectedOptions[0]?.text,
    descripcion: document.getElementById("descripcion").value.trim(),
    destinatarioNombre: document.getElementById("destinatarioNombre").value.trim(),
    destinatarioTelefono: document.getElementById("destinatarioTelefono").value.trim(),
    destinatarioDireccion: document.getElementById("destinatarioDireccion").value.trim(),
    precio: Number(document.getElementById("precio").value),
    fechaEnvio: document.getElementById("fechaEnvio").value,
    fechaEntrega: document.getElementById("fechaEntrega").value
  };

  const errores = [];
  if (!payload.clienteId || !payload.descripcion || !payload.destinatarioNombre || !payload.destinatarioTelefono || !payload.destinatarioDireccion || !payload.fechaEnvio || !payload.fechaEntrega) {
    errores.push("Completa todos los campos obligatorios del envío.");
  }
  if (!/^\d{9}$/.test(payload.destinatarioTelefono)) errores.push("El teléfono del destinatario debe tener 9 dígitos.");
  if (!Number.isFinite(payload.precio) || payload.precio <= 0) errores.push("El precio debe ser mayor a 0.");
  if (payload.fechaEnvio && payload.fechaEntrega && payload.fechaEntrega < payload.fechaEnvio) {
    errores.push("La fecha de entrega no puede ser menor a la fecha de envío.");
  }

  if (errores.length) {
    await showValidationErrors(errores);
    return;
  }

  showLoader();
  try {
    const codigo = await generarCodigoEnvio(user.uid);
    const fechaCreacion = Timestamp.now();

    await addDoc(collection(db, "envios"), {
      codigo,
      cliente_id: payload.clienteId,
      cliente_nombre: payload.clienteNombre,
      descripcion: payload.descripcion,
      destinatario: {
        nombre: payload.destinatarioNombre,
        telefono: payload.destinatarioTelefono,
        direccion: payload.destinatarioDireccion
      },
      precio: payload.precio,
      fecha_envio: toTimestamp(payload.fechaEnvio),
      fecha_entrega: toTimestamp(payload.fechaEntrega),
      user_id: user.uid,
      estado: "almacen",
      fecha: fechaCreacion,
      historial: [{ estado: "almacen", fecha: fechaCreacion }]
    });

    limpiarFormulario();
    await cargarEnvios();
    await toast(`Envío creado (${codigo})`);
  } catch (e) {
    await showError("No se pudo crear el envío.");
  } finally {
    hideLoader();
  }
};

function filtrarEnvios(rows) {
  const texto = document.getElementById("busquedaEnvio").value.trim().toLowerCase();
  const fechaFiltro = document.getElementById("filtroFechaEnvio").value;

  return rows.filter((d) => {
    const cliente = (d.cliente_nombre || "").toLowerCase();
    const descripcion = (d.descripcion || "").toLowerCase();
    const textoOk = !texto || cliente.includes(texto) || descripcion.includes(texto);
    const fechaOk = !fechaFiltro || getDateInputValue(d.fecha_envio) === fechaFiltro;
    return textoOk && fechaOk;
  });
}

async function cargarEnvios() {
  const user = auth.currentUser;
  if (!user) return;

  const alm = document.getElementById("almacen");
  const tra = document.getElementById("transito");
  const ent = document.getElementById("entregado");

  alm.innerHTML = "";
  tra.innerHTML = "";
  ent.innerHTML = "";

  showLoader();
  try {
    const snap = await getDocs(query(collection(db, "envios"), where("user_id", "==", user.uid)));
    enviosData = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => {
      const aMs = a.fecha?.toMillis ? a.fecha.toMillis() : 0;
      const bMs = b.fecha?.toMillis ? b.fecha.toMillis() : 0;
      return bMs - aMs;
    });

    const rows = filtrarEnvios(enviosData);

    if (!rows.length) {
      const empty = '<p class="text-muted">Sin resultados con los filtros actuales.</p>';
      alm.innerHTML = empty;
      tra.innerHTML = empty;
      ent.innerHTML = empty;
      return;
    }

    rows.forEach((d) => {
      const btnAvanzar = d.estado === "entregado" ? "" : `<button onclick="mover('${d.id}')" class="btn btn-sm btn-outline-dark mt-2 w-100">Avanzar estado</button>`;
      const btnEliminar = `<button onclick="eliminarEnvio('${d.id}')" class="btn btn-sm btn-outline-danger mt-2 w-100">Eliminar</button>`;

      const card = `
        <div class="shipment-card mb-2">
          <div><strong>Código:</strong> ${d.codigo || "Sin código"}</div>
          <strong>${d.cliente_nombre || "Sin cliente"}</strong>
          <p class="mb-1"><strong>Estado actual:</strong> ${d.estado}</p>
          <p class="mb-1 text-muted">${d.descripcion}</p>
          ${btnAvanzar}
          ${btnEliminar}
        </div>
      `;

      if (d.estado === "almacen") alm.innerHTML += card;
      else if (d.estado === "transito") tra.innerHTML += card;
      else ent.innerHTML += card;
    });
  } finally {
    hideLoader();
  }
}

window.mover = async function (id) {
  showLoader();
  try {
    const envioRef = doc(db, "envios", id);
    const envioSnap = await getDoc(envioRef);
    if (!envioSnap.exists()) return;

    const estado = envioSnap.data().estado;
    let nuevo = "";

    if (estado === "almacen") nuevo = "transito";
    else if (estado === "transito") nuevo = "entregado";

    if (!nuevo) return;

    await updateDoc(envioRef, {
      estado: nuevo,
      historial: arrayUnion({ estado: nuevo, fecha: Timestamp.now() })
    });

    await cargarEnvios();
    await toast(`Estado actualizado a ${nuevo}`);
  } catch (e) {
    await showError("No se pudo actualizar el estado.");
  } finally {
    hideLoader();
  }
};

window.eliminarEnvio = async function (id) {
  const confirmado = await confirmDelete("Se eliminará el envío y su historial de seguimiento.");
  if (!confirmado) return;

  showLoader();
  try {
    await deleteDoc(doc(db, "envios", id));
    await cargarEnvios();
    await toast("Envío eliminado", "success");
  } catch (e) {
    await showError("No se pudo eliminar el envío.");
  } finally {
    hideLoader();
  }
};

onAuthStateChanged(auth, (user) => {
  if (!user) return;
  cargarClientes();
  cargarEnvios();

  document.getElementById("busquedaEnvio").addEventListener("input", cargarEnvios);
  document.getElementById("filtroFechaEnvio").addEventListener("change", cargarEnvios);
  document.getElementById("limpiarFiltros").addEventListener("click", () => {
    document.getElementById("busquedaEnvio").value = "";
    document.getElementById("filtroFechaEnvio").value = "";
    cargarEnvios();
  });
});
