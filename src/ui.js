import {
  fmt,
  fmtCant,
  fmtFecha,
  fmtFH,
  nowISO,
  todayISO,
  n,
  saldoCaja,
  valorInventario,
  stockAtDate,
  calcPeriodo,
  getCuadre,
  getDiario,
  getBalance,
  detectarAnomalias,
  addProducto,
  addSocio,
  addCompra,
  addVenta,
  addGasto,
  addArqueo,
  cerrarPeriodo,
  calcularReparto,
  exportBackup,
  importBackup
} from './core.js';

import { pedirPermisoNotificaciones } from './pwa.js';

let current = null;
let save = null;

const tabs = [
  ['inicio', 'Inicio'],
  ['ventas', 'Ventas'],
  ['compras', 'Compras'],
  ['productos', 'Productos'],
  ['caja', 'Caja'],
  ['contabilidad', 'Contabilidad'],
  ['analisis', 'Análisis'],
  ['reportes', 'Reportes'],
  ['ajustes', 'Ajustes']
];

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function refresh() {
  await save(current);
  renderApp(current, save);
}

export function renderApp(state, saveFn) {
  current = state;
  save = saveFn;

  const root = document.getElementById('app');

  root.innerHTML = `
    <header class="app-header">
      <h1>${esc(current.cfg.nombre || 'Tienda Pro')}</h1>
      <small>Datos locales · build activo</small>
    </header>

    <nav class="tabs">
      ${tabs
        .map(([id, label]) => {
          return `<button data-tab="${id}" class="${current.ui.tab === id ? 'active' : ''}">${label}</button>`;
        })
        .join('')}
    </nav>

    <main id="main"></main>

    <dialog id="modal"></dialog>
  `;

  root.querySelectorAll('nav [data-tab]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      current.ui.tab = btn.dataset.tab;
      await refresh();
    });
  });

  renderMain();
}

function renderMain() {
  const main = document.getElementById('main');
  const tab = current.ui.tab || 'inicio';

  if (tab === 'inicio') return renderInicio(main);
  if (tab === 'ventas') return renderVentas(main);
  if (tab === 'compras') return renderCompras(main);
  if (tab === 'productos') return renderProductos(main);
  if (tab === 'caja') return renderCaja(main);
  if (tab === 'contabilidad') return renderContabilidad(main);
  if (tab === 'analisis') return renderAnalisis(main);
  if (tab === 'reportes') return renderReportes(main);
  if (tab === 'ajustes') return renderAjustes(main);

  main.innerHTML = '<div class="card">Pantalla no encontrada</div>';
}

function renderInicio(main) {
  const periodo = calcPeriodo(current, current.cfg.periodoInicio, nowISO());
  const caja = saldoCaja(current);
  const inventario = valorInventario(current);
  const anomalias = detectarAnomalias(current);

  const agotados = current.productos.filter((p) => !p.archivado && stockAtDate(current, p.id, nowISO()) <= 0).length;

  const bajos = current.productos.filter((p) => {
    if (p.archivado) return false;
    const stock = stockAtDate(current, p.id, nowISO());
    return stock > 0 && stock <= n(p.stockMin);
  }).length;

  main.innerHTML = `
    <section class="cards">
      <div class="card">
        <div class="label">Efectivo en caja</div>
        <div class="metric ${caja < 0 ? 'negative' : 'positive'}">${fmt(caja)}</div>
      </div>

      <div class="card">
        <div class="label">Inventario</div>
        <div class="metric">${fmt(inventario)}</div>
      </div>

      <div class="card">
        <div class="label">Ventas del periodo</div>
        <div class="metric">${fmt(periodo.ingresos)}</div>
        <div class="muted">Desde ${fmtFecha(current.cfg.periodoInicio)}</div>
      </div>

      <div class="card">
        <div class="label">Ganancia neta</div>
        <div class="metric ${periodo.neta < 0 ? 'negative' : 'positive'}">${fmt(periodo.neta)}</div>
      </div>

      <div class="card">
        <div class="label">Compras</div>
        <div class="metric">${fmt(periodo.cogs)}</div>
      </div>

      <div class="card">
        <div class="label">Margen neto</div>
        <div class="metric">${periodo.margenN}%</div>
      </div>
    </section>

    <section class="card">
      <h2>Indicadores</h2>
      <div class="row">
        <span class="badge ${agotados ? 'danger' : 'ok'}">${agotados} agotado(s)</span>
        <span class="badge ${bajos ? 'warn' : 'ok'}">${bajos} bajo stock</span>
        <span class="badge ${caja < 0 ? 'danger' : 'ok'}">Caja ${caja < 0 ? 'negativa' : 'normal'}</span>
        <span class="badge info">Periodo abierto</span>
      </div>
    </section>

    ${
      anomalias.length
        ? `<section class="card">
            <h2>Alertas</h2>
            ${anomalias.slice(0, 8).map((a) => `<div class="alert ${a.nivel}">${esc(a.mensaje)}</div>`).join('')}
          </section>`
        : ''
    }

    <section class="card">
      <h2>Accesos rápidos</h2>
      <div class="row">
        <button class="btn" data-goto="ventas">Nueva venta</button>
        <button class="btn secondary" data-goto="compras">Registrar compra</button>
        <button class="btn secondary" data-goto="caja">Arqueo</button>
        <button class="btn secondary" data-goto="productos">Inventario</button>
        <button class="btn secondary" data-goto="reportes">Reportes</button>
      </div>
    </section>
  `;

  main.querySelectorAll('[data-goto]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      current.ui.tab = btn.dataset.goto;
      await refresh();
    });
  });
}

function renderVentas(main) {
  const productos = current.productos.filter((p) => !p.archivado);

  main.innerHTML = `
    <section class="card">
      <h2>Venta rápida</h2>
      <div class="grid two">
        <label>
          Producto
          <select id="ventaProducto">
            ${productos
              .map((p) => `<option value="${p.id}">${esc(p.nombre)} · Stock ${fmtCant(stockAtDate(current, p.id, nowISO()))}</option>`)
              .join('')}
          </select>
        </label>

        <label>
          Cantidad
          <input id="ventaCantidad" type="number" min="0" step="any" value="1" />
        </label>

        <label>
          Precio
          <input id="ventaPrecio" type="number" min="0" step="any" value="${n(productos[0]?.precio)}" />
        </label>
      </div>

      <br />

      <div class="row">
        <button id="btnVenta" class="btn">Registrar venta</button>
      </div>
    </section>

    <section class="card">
      <h2>Últimas ventas</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Detalle</th>
              <th>Total</th>
              <th>Ganancia</th>
            </tr>
          </thead>
          <tbody>
            ${
              current.ventas.length
                ? current.ventas
                    .slice(-20)
                    .reverse()
                    .map((v) => {
                      return `
                        <tr>
                          <td>${fmtFH(v.fecha)}</td>
                          <td>${esc(v.items.map((i) => `${i.nombre} ×${fmtCant(i.cantidad)}`).join(', '))}</td>
                          <td>${fmt(v.total)}</td>
                          <td class="${v.ganancia < 0 ? 'negative' : 'positive'}">${fmt(v.ganancia)}</td>
                        </tr>
                      `;
                    })
                    .join('')
                : '<tr><td colspan="4">Sin ventas</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </section>
  `;

  const select = main.querySelector('#ventaProducto');
  const precioInput = main.querySelector('#ventaPrecio');

  select?.addEventListener('change', () => {
    const prod = current.productos.find((p) => p.id === select.value);
    if (prod) precioInput.value = prod.precio;
  });

  main.querySelector('#btnVenta')?.addEventListener('click', async () => {
    try {
      const productoId = main.querySelector('#ventaProducto').value;
      const cantidad = main.querySelector('#ventaCantidad').value;
      const precio = main.querySelector('#ventaPrecio').value;

      addVenta(current, [{ productoId, cantidad, precio }], { metodo: 'contado' });
      await refresh();
    } catch (err) {
      alert(err.message);
    }
  });
}

function renderCompras(main) {
  const productos = current.productos.filter((p) => !p.archivado);

  main.innerHTML = `
    <section class="card">
      <h2>Registrar compra</h2>

      <div class="grid two">
        <label>
          Producto
          <select id="compraProducto">
            ${productos.map((p) => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('')}
          </select>
        </label>

        <label>
          Cantidad
          <input id="compraCantidad" type="number" min="0" step="any" value="1" />
        </label>

        <label>
          Costo unitario
          <input id="compraCosto" type="number" min="0" step="any" value="${n(productos[0]?.costo)}" />
        </label>
      </div>

      <br />

      <div class="row">
        <button id="btnCompra" class="btn">Registrar compra</button>
      </div>
    </section>

    <section class="card">
      <h2>Últimas compras</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Producto</th>
              <th>Cantidad</th>
              <th>Costo</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${
              current.compras.length
                ? current.compras
                    .slice(-20)
                    .reverse()
                    .map((c) => {
                      return `
                        <tr>
                          <td>${fmtFH(c.fecha)}</td>
                          <td>${esc(c.productoNombre)}</td>
                          <td>${fmtCant(c.cantidad)}</td>
                          <td>${fmt(c.costo)}</td>
                          <td>${fmt(c.total)}</td>
                        </tr>
                      `;
                    })
                    .join('')
                : '<tr><td colspan="5">Sin compras</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </section>
  `;

  const select = main.querySelector('#compraProducto');
  const costoInput = main.querySelector('#compraCosto');

  select?.addEventListener('change', () => {
    const prod = current.productos.find((p) => p.id === select.value);
    if (prod) costoInput.value = prod.costo;
  });

  main.querySelector('#btnCompra')?.addEventListener('click', async () => {
    try {
      addCompra(current, {
        productoId: main.querySelector('#compraProducto').value,
        cantidad: main.querySelector('#compraCantidad').value,
        costo: main.querySelector('#compraCosto').value
      });

      await refresh();
    } catch (err) {
      alert(err.message);
    }
  });
}

function renderProductos(main) {
  main.innerHTML = `
    <section class="card">
      <h2>Agregar producto</h2>

      <div class="grid two">
        <label>
          Nombre
          <input id="prodNombre" />
        </label>

        <label>
          Código
          <input id="prodCodigo" />
        </label>

        <label>
          Precio
          <input id="prodPrecio" type="number" min="0" step="any" />
        </label>

        <label>
          Costo
          <input id="prodCosto" type="number" min="0" step="any" />
        </label>

        <label>
          Stock mínimo
          <input id="prodMin" type="number" min="0" step="any" value="0" />
        </label>

        <label>
          Unidad
          <input id="prodUnidad" placeholder="u, kg, lb" />
        </label>
      </div>

      <br />

      <div class="row">
        <button id="btnProducto" class="btn">Guardar producto</button>
      </div>
    </section>

    <section class="card">
      <h2>Productos</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Stock</th>
              <th>Precio</th>
              <th>Costo</th>
              <th>Estado</th>
              <th>QR</th>
            </tr>
          </thead>
          <tbody>
            ${
              current.productos.length
                ? current.productos
                    .filter((p) => !p.archivado)
                    .map((p) => {
                      const stock = stockAtDate(current, p.id, nowISO());

                      const estado =
                        stock <= 0
                          ? '<span class="badge danger">Agotado</span>'
                          : stock <= n(p.stockMin)
                          ? '<span class="badge warn">Bajo</span>'
                          : '<span class="badge ok">Disponible</span>';

                      return `
                        <tr>
                          <td>${esc(p.nombre)}</td>
                          <td>${fmtCant(stock)} ${esc(p.unidad || '')}</td>
                          <td>${fmt(p.precio)}</td>
                          <td>${fmt(p.costo)}</td>
                          <td>${estado}</td>
                          <td><button class="btn secondary" data-qr="${p.id}">QR</button></td>
                        </tr>
                      `;
                    })
                    .join('')
                : '<tr><td colspan="6">Sin productos</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </section>
  `;

  main.querySelector('#btnProducto')?.addEventListener('click', async () => {
    addProducto(current, {
      nombre: main.querySelector('#prodNombre').value.trim(),
      codigo: main.querySelector('#prodCodigo').value.trim(),
      precio: main.querySelector('#prodPrecio').value,
      costo: main.querySelector('#prodCosto').value,
      stockMin: main.querySelector('#prodMin').value,
      unidad: main.querySelector('#prodUnidad').value.trim()
    });

    await refresh();
  });

  main.querySelectorAll('[data-qr]').forEach((btn) => {
    btn.addEventListener('click', () => showQR(btn.dataset.qr));
  });
}

async function showQR(productoId) {
  const prod = current.productos.find((p) => p.id === productoId);
  if (!prod) return;

  const dialog = document.getElementById('modal');
  const QRCode = (await import('qrcode')).default;

  const stock = stockAtDate(current, prod.id, nowISO());

  const text = [
    `Tienda: ${current.cfg.nombre}`,
    `Producto: ${prod.nombre}`,
    `Código: ${prod.codigo || '-'}`,
    `Existencia: ${fmtCant(stock)} ${prod.unidad || ''}`,
    `Actualizado: ${fmtFH(nowISO())}`
  ].join('\n');

  const dataUrl = await QRCode.toDataURL(text, { width: 240, margin: 1 });

  dialog.innerHTML = `
    <div class="modal-card">
      <h3>Existencia QR</h3>
      <img class="qr-img" src="${dataUrl}" alt="QR" />
      <div class="pre">${esc(text)}</div>
      <br />
      <button class="btn secondary" id="closeModal">Cerrar</button>
    </div>
  `;

  dialog.showModal();
  dialog.querySelector('#closeModal').addEventListener('click', () => dialog.close());
}

function renderCaja(main) {
  const caja = saldoCaja(current);
  const movimientos = current.movimientos.slice(-30).reverse();

  main.innerHTML = `
    <section class="cards">
      <div class="card">
        <div class="label">Saldo en caja</div>
        <div class="metric ${caja < 0 ? 'negative' : 'positive'}">${fmt(caja)}</div>
      </div>
    </section>

    <section class="card">
      <h2>Arqueo</h2>
      <div class="grid two">
        <label>
          Dinero contado
          <input id="arqueoFisico" type="number" step="any" value="${caja}" />
        </label>
      </div>
      <br />
      <button id="btnArqueo" class="btn">Registrar arqueo</button>
    </section>

    <section class="card">
      <h2>Gasto operativo</h2>
      <div class="grid two">
        <label>
          Categoría
          <select id="gastoCategoria">
            <option value="luz">Luz</option>
            <option value="agua">Agua</option>
            <option value="alquiler">Alquiler</option>
            <option value="internet">Internet</option>
            <option value="transporte">Transporte</option>
            <option value="otros">Otros</option>
          </select>
        </label>

        <label>
          Concepto
          <input id="gastoConcepto" />
        </label>

        <label>
          Monto
          <input id="gastoMonto" type="number" min="0" step="any" />
        </label>
      </div>
      <br />
      <button id="btnGasto" class="btn danger">Registrar gasto</button>
    </section>

    <section class="card">
      <h2>Movimientos recientes</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Concepto</th>
              <th>Tipo</th>
              <th>Monto</th>
            </tr>
          </thead>
          <tbody>
            ${
              movimientos.length
                ? movimientos
                    .map((m) => {
                      return `
                        <tr>
                          <td>${fmtFH(m.fecha)}</td>
                          <td>${esc(m.concepto)}</td>
                          <td>${m.tipo}</td>
                          <td class="${m.tipo === 'ingreso' ? 'positive' : 'negative'}">
                            ${m.tipo === 'ingreso' ? '+' : '-'}${fmt(m.monto)}
                          </td>
                        </tr>
                      `;
                    })
                    .join('')
                : '<tr><td colspan="4">Sin movimientos</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </section>
  `;

  main.querySelector('#btnArqueo')?.addEventListener('click', async () => {
    try {
      addArqueo(current, {
        fisico: main.querySelector('#arqueoFisico').value
      });
      await refresh();
    } catch (err) {
      alert(err.message);
    }
  });

  main.querySelector('#btnGasto')?.addEventListener('click', async () => {
    try {
      addGasto(current, {
        categoria: main.querySelector('#gastoCategoria').value,
        concepto: main.querySelector('#gastoConcepto').value.trim(),
        monto: main.querySelector('#gastoMonto').value
      });
      await refresh();
    } catch (err) {
      alert(err.message);
    }
  });
}

function renderContabilidad(main) {
  const balance = getBalance(current);
  const periodo = calcPeriodo(current, current.cfg.periodoInicio, nowISO());
  const reparto = calcularReparto(current, periodo.neta);
  const diario = getDiario(current, current.cfg.periodoInicio, nowISO()).slice(-50).reverse();

  main.innerHTML = `
    <section class="cards">
      <div class="card">
        <div class="label">Caja</div>
        <div class="metric">${fmt(balance.caja)}</div>
      </div>

      <div class="card">
        <div class="label">Inventario</div>
        <div class="metric">${fmt(balance.inventario)}</div>
      </div>

      <div class="card">
        <div class="label">Activos</div>
        <div class="metric">${fmt(balance.activos)}</div>
      </div>

      <div class="card">
        <div class="label">Patrimonio</div>
        <div class="metric">${fmt(balance.patrimonio)}</div>
      </div>
    </section>

    <section class="card">
      <h2>Estado de resultados del periodo</h2>
      <div class="table-wrap">
        <table>
          <tbody>
            <tr><td>Ingresos</td><td>${fmt(periodo.ingresos)}</td></tr>
            <tr><td>Costo de ventas</td><td>- ${fmt(periodo.cogs)}</td></tr>
            <tr><td>Ganancia bruta</td><td>${fmt(periodo.bruta)}</td></tr>
            <tr><td>Gastos operativos</td><td>- ${fmt(periodo.gastos)}</td></tr>
            <tr><td>Mermas</td><td>- ${fmt(periodo.mermas)}</td></tr>
            <tr><td><strong>Ganancia neta</strong></td><td><strong>${fmt(periodo.neta)}</strong></td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="card">
      <h2>Socios</h2>

      <div class="grid two">
        <label>
          Nombre
          <input id="socioNombre" />
        </label>

        <label>
          Porcentaje
          <input id="socioPorcentaje" type="number" min="0" max="100" step="any" />
        </label>
      </div>

      <br />

      <button id="btnSocio" class="btn">Agregar socio</button>

      <br /><br />

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Socio</th>
              <th>%</th>
              <th>Reparto del periodo</th>
            </tr>
          </thead>
          <tbody>
            ${
              reparto.length
                ? reparto
                    .map((s) => {
                      return `
                        <tr>
                          <td>${esc(s.nombre)}</td>
                          <td>${fmtCant(s.porcentaje)}%</td>
                          <td>${fmt(s.monto)}</td>
                        </tr>
                      `;
                    })
                    .join('')
                : '<tr><td colspan="3">Sin socios</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </section>

    <section class="card">
      <h2>Diario reciente</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Cuenta</th>
              <th>Concepto</th>
              <th>Debe</th>
              <th>Haber</th>
            </tr>
          </thead>
          <tbody>
            ${
              diario.length
                ? diario
                    .map((d) => {
                      return `
                        <tr>
                          <td>${fmtFecha(d.fecha)}</td>
                          <td>${esc(d.cuenta)}</td>
                          <td>${esc(d.concepto)}</td>
                          <td>${d.debe ? fmt(d.debe) : ''}</td>
                          <td>${d.haber ? fmt(d.haber) : ''}</td>
                        </tr>
                      `;
                    })
                    .join('')
                : '<tr><td colspan="5">Sin asientos</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </section>

    <section class="card">
      <h2>Cierre de periodo</h2>
      <p class="muted">
        Periodo actual desde ${fmtFecha(current.cfg.periodoInicio)}.
        Ventas: ${fmt(periodo.ingresos)} · Ganancia neta: ${fmt(periodo.neta)}
      </p>
      <button id="btnCerrar" class="btn danger">Cerrar periodo</button>
    </section>
  `;

  main.querySelector('#btnSocio')?.addEventListener('click', async () => {
    addSocio(current, {
      nombre: main.querySelector('#socioNombre').value.trim(),
      porcentaje: main.querySelector('#socioPorcentaje').value
    });
    await refresh();
  });

  main.querySelector('#btnCerrar')?.addEventListener('click', async () => {
    if (!confirm('¿Cerrar periodo y empezar uno nuevo?')) return;
    cerrarPeriodo(current);
    await refresh();
  });
}

function renderAnalisis(main) {
  const fecha = todayISO();

  main.innerHTML = `
    <section class="card">
      <h2>Ventas por día</h2>
      <input id="fechaAnalisis" type="date" value="${fecha}" />
      <div id="detalleDia"></div>
    </section>

    <section class="card">
      <h2>Top rentables del periodo</h2>
      <div id="topRentables"></div>
    </section>

    <section class="card">
      <h2>Anomalías</h2>
      ${
        detectarAnomalias(current).length
          ? detectarAnomalias(current)
              .slice(0, 10)
              .map((a) => `<div class="alert ${a.nivel}">${esc(a.mensaje)}</div>`)
              .join('')
          : '<p class="muted">Sin anomalías detectadas</p>'
      }
    </section>
  `;

  const input = main.querySelector('#fechaAnalisis');

  function renderDia() {
    const date = input.value;
    const ventasDia = current.ventas.filter((v) => v.fecha.slice(0, 10) === date);
    const comprasDia = current.compras.filter((c) => c.fecha.slice(0, 10) === date);
    const gastosDia = current.gastos.filter((g) => g.fecha.slice(0, 10) === date);

    const totalVentas = ventasDia.reduce((acc, v) => acc + n(v.total), 0);
    const totalGanancia = ventasDia.reduce((acc, v) => acc + n(v.ganancia), 0);
    const totalCompras = comprasDia.reduce((acc, c) => acc + n(c.total), 0);
    const totalGastos = gastosDia.reduce((acc, g) => acc + n(g.monto), 0);

    main.querySelector('#detalleDia').innerHTML = `
      <br />
      <div class="cards">
        <div class="card"><div class="label">Ventas</div><div class="metric">${fmt(totalVentas)}</div></div>
        <div class="card"><div class="label">Ganancia</div><div class="metric ${totalGanancia < 0 ? 'negative' : 'positive'}">${fmt(totalGanancia)}</div></div>
        <div class="card"><div class="label">Compras</div><div class="metric">${fmt(totalCompras)}</div></div>
        <div class="card"><div class="label">Gastos</div><div class="metric">${fmt(totalGastos)}</div></div>
      </div>
    `;
  }

  function renderTop() {
    const periodo = calcPeriodo(current, current.cfg.periodoInicio, nowISO());
    const map = new Map();

    for (const v of current.ventas.filter((x) => x.estado !== 'anulada')) {
      for (const item of v.items) {
        const prev = map.get(item.productoId) || { nombre: item.nombre, gan: 0, ingresos: 0 };
        prev.gan += n(item.ganancia);
        prev.ingresos += n(item.total);
        map.set(item.productoId, prev);
      }
    }

    const top = [...map.values()].sort((a, b) => b.gan - a.gan).slice(0, 5);

    main.querySelector('#topRentables').innerHTML = top.length
      ? `<div class="table-wrap"><table><thead><tr><th>#</th><th>Producto</th><th>Ganancia</th></tr></thead><tbody>
          ${top.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.nombre)}</td><td>${fmt(x.gan)}</td></tr>`).join('')}
        </tbody></table></div>`
      : '<p class="muted">Sin ventas en el periodo</p>';
  }

  input.addEventListener('change', renderDia);
  renderDia();
  renderTop();
}

function renderReportes(main) {
  main.innerHTML = `
    <section class="card">
      <h2>Reporte por periodo</h2>

      <div class="grid two">
        <label>
          Desde
          <input id="repInicio" type="date" value="${current.cfg.periodoInicio}" />
        </label>

        <label>
          Hasta
          <input id="repFin" type="date" value="${todayISO()}" />
        </label>
      </div>

      <br />

      <div class="row">
        <button id="btnReporte" class="btn">Generar</button>
        <button id="btnPDF" class="btn secondary">Exportar PDF</button>
      </div>

      <div id="reportOutput"></div>
    </section>
  `;

  function generateReport() {
    const start = main.querySelector('#repInicio').value;
    const end = main.querySelector('#repFin').value;

    const periodo = calcPeriodo(current, start, end);
    const cuadre = getCuadre(current, start, end);

    main.querySelector('#reportOutput').innerHTML = `
      <br />

      <section class="cards">
        <div class="card"><div class="label">Ingresos</div><div class="metric">${fmt(periodo.ingresos)}</div></div>
        <div class="card"><div class="label">Costos</div><div class="metric">${fmt(periodo.cogs)}</div></div>
        <div class="card"><div class="label">Ganancia bruta</div><div class="metric">${fmt(periodo.bruta)}</div></div>
        <div class="card"><div class="label">Gastos</div><div class="metric">${fmt(periodo.gastos)}</div></div>
        <div class="card"><div class="label">Ganancia neta</div><div class="metric ${periodo.neta < 0 ? 'negative' : 'positive'}">${fmt(periodo.neta)}</div></div>
        <div class="card"><div class="label">Valor inventario</div><div class="metric">${fmt(cuadre.totals.valorInventario)}</div></div>
      </section>

      <section class="card">
        <h3>Cuadre general de productos</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Compras</th>
                <th>Costo compra</th>
                <th>Ventas</th>
                <th>Precio venta</th>
                <th>Costo venta</th>
                <th>Ingresos</th>
                <th>Costo</th>
                <th>Ganancia</th>
                <th>Stock final</th>
                <th>Valor inventario</th>
              </tr>
            </thead>
            <tbody>
              ${
                cuadre.rows.length
                  ? cuadre.rows
                      .map((r) => {
                        return `
                          <tr>
                            <td>${esc(r.nombre)}</td>
                            <td>${fmtCant(r.comprasCantidad)}</td>
                            <td>${fmt(r.costoCompraUnitario)}</td>
                            <td>${fmtCant(r.ventasCantidad)}</td>
                            <td>${fmt(r.precioVentaUnitario)}</td>
                            <td>${fmt(r.costoVentaUnitario)}</td>
                            <td>${fmt(r.ingresos)}</td>
                            <td>${fmt(r.costo)}</td>
                            <td class="${r.ganancia < 0 ? 'negative' : 'positive'}">${fmt(r.ganancia)}</td>
                            <td>${fmtCant(r.stockFinal)}</td>
                            <td>${fmt(r.valorInventario)}</td>
                          </tr>
                        `;
                      })
                      .join('')
                  : '<tr><td colspan="11">Sin productos</td></tr>'
              }

              <tr>
                <td><strong>Total</strong></td>
                <td><strong>${fmtCant(cuadre.totals.comprasCantidad)}</strong></td>
                <td></td>
                <td><strong>${fmtCant(cuadre.totals.ventasCantidad)}</strong></td>
                <td></td>
                <td></td>
                <td><strong>${fmt(cuadre.totals.ingresos)}</strong></td>
                <td><strong>${fmt(cuadre.totals.costo)}</strong></td>
                <td><strong>${fmt(cuadre.totals.ganancia)}</strong></td>
                <td><strong>${fmtCant(cuadre.totals.stockFinal)}</strong></td>
                <td><strong>${fmt(cuadre.totals.valorInventario)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  main.querySelector('#btnReporte').addEventListener('click', generateReport);

  main.querySelector('#btnPDF').addEventListener('click', async () => {
    const start = main.querySelector('#repInicio').value;
    const end = main.querySelector('#repFin').value;
    await generarPDF(start, end);
  });
}

async function generarPDF(start, end) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF();

  const periodo = calcPeriodo(current, start, end);
  const cuadre = getCuadre(current, start, end);
  const balance = getBalance(current);
  const reparto = calcularReparto(current, periodo.neta);

  doc.setFontSize(18);
  doc.text(current.cfg.nombre || 'Tienda Pro', 14, 18);

  doc.setFontSize(10);
  doc.text(`Cuadre: ${fmtFecha(start)} a ${fmtFecha(end)}`, 14, 26);
  doc.text(`Generado: ${fmtFH(nowISO())}`, 14, 32);

  autoTable(doc, {
    startY: 38,
    head: [['Resumen', 'Monto']],
    body: [
      ['Ingresos', fmt(periodo.ingresos)],
      ['Costo de ventas', fmt(periodo.cogs)],
      ['Ganancia bruta', fmt(periodo.bruta)],
      ['Gastos operativos', fmt(periodo.gastos)],
      ['Mermas', fmt(periodo.mermas)],
      ['Ganancia neta', fmt(periodo.neta)],
      ['Caja', fmt(balance.caja)],
      ['Inventario', fmt(balance.inventario)],
      ['Patrimonio', fmt(balance.patrimonio)]
    ],
    theme: 'grid',
    headStyles: { fillColor: [37, 99, 235] }
  });

  let y = doc.lastAutoTable.finalY + 10;

  autoTable(doc, {
    startY: y,
    head: [['Socio', '%', 'Monto']],
    body: reparto.length
      ? reparto.map((s) => [s.nombre, `${fmtCant(s.porcentaje)}%`, fmt(s.monto)])
      : [['Sin socios', '', '']],
    theme: 'grid',
    headStyles: { fillColor: [22, 163, 74] }
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 10,
    head: [
      [
        'Producto',
        'Compras',
        'Costo compra',
        'Ventas',
        'Precio venta',
        'Costo venta',
        'Ingresos',
        'Costo',
        'Ganancia',
        'Stock',
        'Valor inv.'
      ]
    ],
    body: cuadre.rows.map((r) => [
      r.nombre,
      fmtCant(r.comprasCantidad),
      fmt(r.costoCompraUnitario),
      fmtCant(r.ventasCantidad),
      fmt(r.precioVentaUnitario),
      fmt(r.costoVentaUnitario),
      fmt(r.ingresos),
      fmt(r.costo),
      fmt(r.ganancia),
      fmtCant(r.stockFinal),
      fmt(r.valorInventario)
    ]),
    foot: [
      [
        'Total',
        fmtCant(cuadre.totals.comprasCantidad),
        '',
        fmtCant(cuadre.totals.ventasCantidad),
        '',
        '',
        fmt(cuadre.totals.ingresos),
        fmt(cuadre.totals.costo),
        fmt(cuadre.totals.ganancia),
        fmtCant(cuadre.totals.stockFinal),
        fmt(cuadre.totals.valorInventario)
      ]
    ],
    styles: { fontSize: 6 },
    headStyles: { fillColor: [37, 99, 235] },
    footStyles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: 'bold' }
  });

  doc.save('cuadre-tienda-pro.pdf');
}

function renderAjustes(main) {
  main.innerHTML = `
    <section class="card">
      <h2>Ajustes</h2>

      <div class="grid two">
        <label>
          Nombre de la tienda
          <input id="cfgNombre" value="${esc(current.cfg.nombre)}" />
        </label>

        <label>
          Hora de arqueo
          <input id="cfgHora" type="time" value="${esc(current.cfg.horaArqueo || '18:00')}" />
        </label>

        <label>
          Días para cierre pendiente
          <input id="cfgDias" type="number" min="1" value="${n(current.cfg.diasCierre)}" />
        </label>

        <label>
          Capital inicial
          <input id="cfgCapital" type="number" step="any" value="${n(current.cfg.capitalInicial)}" />
        </label>
      </div>

      <br />

      <div class="row">
        <button id="btnGuardarCfg" class="btn">Guardar ajustes</button>
        <button id="btnPermiso" class="btn secondary">Activar notificaciones</button>
        <button id="btnExport" class="btn secondary">Exportar respaldo</button>
      </div>

      <br />

      <label>
        Importar respaldo
        <input id="importFile" type="file" accept="application/json" />
      </label>
    </section>
  `;

  main.querySelector('#btnGuardarCfg')?.addEventListener('click', async () => {
    current.cfg.nombre = main.querySelector('#cfgNombre').value.trim() || 'Tienda Pro';
    current.cfg.horaArqueo = main.querySelector('#cfgHora').value;
    current.cfg.diasCierre = n(main.querySelector('#cfgDias').value);
    current.cfg.capitalInicial = n(main.querySelector('#cfgCapital').value);
    await refresh();
  });

  main.querySelector('#btnPermiso')?.addEventListener('click', async () => {
    const ok = await pedirPermisoNotificaciones();
    current.cfg.notificaciones = ok;
    await refresh();
    alert(ok ? 'Notificaciones permitidas' : 'No se pudo conceder permiso de notificaciones');
  });

  main.querySelector('#btnExport')?.addEventListener('click', () => {
    const blob = new Blob([exportBackup(current)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tienda-pro-backup.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  main.querySelector('#importFile')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      importBackup(current, text);
      await refresh();
      alert('Datos importados');
    } catch {
      alert('Archivo inválido');
    }
  });
}
