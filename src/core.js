const STORAGE_KEY = 'tienda-pro-v6';

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function nowISO() {
  return new Date().toISOString();
}

export function uid() {
  return crypto?.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export function round2(v) {
  return Math.round((n(v) + Number.EPSILON) * 100) / 100;
}

export function fmt(v) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'USD'
  }).format(n(v));
}

export function fmtCant(v) {
  return new Intl.NumberFormat('es-ES', {
    maximumFractionDigits: 2
  }).format(n(v));
}

export function fmtFecha(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-ES');
}

export function fmtFH(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-ES');
}

export const defaultState = {
  cfg: {
    nombre: 'Tienda Pro',
    tema: 'light',
    pin: '',
    capitalInicial: 0,
    periodoInicio: todayISO(),
    fechaInicioApp: todayISO(),
    horaArqueo: '18:00',
    diasCierre: 30,
    notificaciones: false,
    qrMode: 'auto'
  },
  ui: {
    tab: 'inicio'
  },
  productos: [],
  lotes: [],
  ventas: [],
  compras: [],
  gastos: [],
  socios: [],
  movimientos: [],
  ajustes: [],
  arqueos: [],
  cierres: [],
  anomalias: []
};

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function migrate(raw) {
  const base = clone(defaultState);
  const merged = { ...base, ...(raw || {}) };

  for (const key of Object.keys(base)) {
    if (Array.isArray(base[key]) && !Array.isArray(merged[key])) {
      merged[key] = base[key];
    }
  }

  merged.cfg = { ...base.cfg, ...(raw?.cfg || {}) };
  merged.ui = { ...base.ui, ...(raw?.ui || {}) };

  return merged;
}

export async function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return clone(defaultState);
    return migrate(JSON.parse(raw));
  } catch {
    return clone(defaultState);
  }
}

export async function saveState(state) {
  state.updatedAt = nowISO();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function exportBackup(state) {
  return JSON.stringify(state, null, 2);
}

export function importBackup(state, json) {
  const parsed = JSON.parse(json);
  const migrated = migrate(parsed);

  for (const key of Object.keys(migrated)) {
    state[key] = migrated[key];
  }

  return state;
}

function inRange(fecha, start, end) {
  if (!fecha || !start || !end) return false;

  const t = new Date(fecha).getTime();

  const s = new Date(start);
  s.setHours(0, 0, 0, 0);

  const e = new Date(end);
  e.setHours(23, 59, 59, 999);

  return t >= s.getTime() && t <= e.getTime();
}

export function addMovimiento(state, { tipo, monto, categoria = '', concepto = '', origen = '', fecha = nowISO() }) {
  const mov = {
    id: uid(),
    fecha,
    tipo,
    monto: round2(monto),
    categoria,
    concepto,
    origen
  };

  state.movimientos.push(mov);
  return mov;
}

export function saldoCaja(state, atISO = null) {
  const limit = atISO ? new Date(atISO).getTime() : Infinity;

  let saldo = n(state.cfg.capitalInicial);

  for (const m of state.movimientos) {
    const t = new Date(m.fecha).getTime();
    if (t <= limit) {
      saldo += m.tipo === 'ingreso' ? n(m.monto) : -n(m.monto);
    }
  }

  return round2(saldo);
}

export function stockAtDate(state, productoId, dateISO = null) {
  const limit = dateISO ? new Date(dateISO).getTime() : Date.now();

  let stock = 0;

  for (const c of state.compras) {
    if (c.productoId === productoId && new Date(c.fecha).getTime() <= limit) {
      stock += n(c.cantidad);
    }
  }

  for (const v of state.ventas) {
    if (new Date(v.fecha).getTime() <= limit) {
      for (const item of v.items) {
        if (item.productoId === productoId) {
          stock -= n(item.cantidad);
        }
      }
    }
  }

  for (const a of state.ajustes) {
    if (a.productoId === productoId && new Date(a.fecha).getTime() <= limit) {
      stock += n(a.cantidad);
    }
  }

  return round2(stock);
}

export function valorInventario(state) {
  let total = 0;

  for (const lote of state.lotes) {
    const restante = n(lote.cantidadInicial) - n(lote.cantidadVendida);
    if (restante > 0) {
      total += restante * n(lote.costo);
    }
  }

  return round2(total);
}

export function addProducto(state, data) {
  const prod = {
    id: uid(),
    nombre: '',
    codigo: '',
    precio: 0,
    costo: 0,
    stockMin: 0,
    unidad: '',
    archivado: false,
    visibleQR: true,
    ...data
  };

  state.productos.push(prod);
  return prod;
}

export function addSocio(state, data) {
  const socio = {
    id: uid(),
    nombre: '',
    porcentaje: 0,
    activo: true,
    ...data,
    porcentaje: n(data.porcentaje)
  };

  state.socios.push(socio);
  return socio;
}

export function addCompra(state, { productoId, cantidad, costo, fecha = nowISO(), nota = '' }) {
  const prod = state.productos.find((p) => p.id === productoId);
  if (!prod) throw new Error('Producto no encontrado');

  cantidad = n(cantidad);
  costo = n(costo);

  if (cantidad <= 0) throw new Error('La cantidad debe ser mayor que cero');

  const lote = {
    id: uid(),
    productoId,
    fecha,
    cantidadInicial: cantidad,
    cantidadVendida: 0,
    costo
  };

  state.lotes.push(lote);

  const compra = {
    id: uid(),
    productoId,
    productoNombre: prod.nombre,
    fecha,
    cantidad,
    costo,
    total: round2(cantidad * costo),
    nota
  };

  state.compras.push(compra);

  addMovimiento(state, {
    tipo: 'egreso',
    categoria: 'compra',
    concepto: `Compra: ${prod.nombre}`,
    monto: compra.total,
    origen: 'compra',
    fecha
  });

  return compra;
}

export function addVenta(state, items, { fecha = nowISO(), metodo = 'contado' } = {}) {
  const venta = {
    id: uid(),
    fecha,
    items: [],
    total: 0,
    costo: 0,
    ganancia: 0,
    metodo,
    estado: 'activa'
  };

  for (const item of items) {
    const prod = state.productos.find((p) => p.id === item.productoId);
    if (!prod) throw new Error('Producto no encontrado');

    const cantidad = n(item.cantidad);
    const precio = n(item.precio ?? prod.precio);

    if (cantidad <= 0) throw new Error('Cantidad inválida');

    const disponible = stockAtDate(state, prod.id, fecha);
    if (disponible < cantidad) {
      throw new Error(`Stock insuficiente para ${prod.nombre}`);
    }

    let restante = cantidad;
    let costoItem = 0;

    const lotes = state.lotes
      .filter((l) => l.productoId === prod.id && n(l.cantidadInicial) - n(l.cantidadVendida) > 0)
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    for (const lote of lotes) {
      if (restante <= 0) break;

      const disponibleLote = n(lote.cantidadInicial) - n(lote.cantidadVendida);
      const take = Math.min(disponibleLote, restante);

      lote.cantidadVendida = n(lote.cantidadVendida) + take;
      costoItem += take * n(lote.costo);
      restante -= take;
    }

    if (restante > 0) {
      costoItem += restante * n(prod.costo);
    }

    const totalItem = round2(cantidad * precio);
    const costoUnitario = round2(costoItem / cantidad);

    venta.items.push({
      productoId: prod.id,
      nombre: prod.nombre,
      cantidad,
      precio,
      costoUnitario,
      total: totalItem,
      ganancia: round2(totalItem - costoItem)
    });

    venta.total += totalItem;
    venta.costo += costoItem;
    venta.ganancia += totalItem - costoItem;
  }

  venta.total = round2(venta.total);
  venta.costo = round2(venta.costo);
  venta.ganancia = round2(venta.ganancia);

  state.ventas.push(venta);

  if (metodo === 'contado') {
    addMovimiento(state, {
      tipo: 'ingreso',
      categoria: 'venta',
      concepto: `Venta ${fmtFecha(fecha)}`,
      monto: venta.total,
      origen: 'venta',
      fecha
    });
  }

  return venta;
}

export function addGasto(state, { categoria = 'otros', concepto = '', monto, fecha = nowISO() }) {
  monto = n(monto);
  if (monto <= 0) throw new Error('Monto inválido');

  const gasto = {
    id: uid(),
    fecha,
    categoria,
    concepto,
    monto: round2(monto)
  };

  state.gastos.push(gasto);

  addMovimiento(state, {
    tipo: 'egreso',
    categoria: 'gasto',
    concepto: `Gasto ${categoria}: ${concepto || 'Sin detalle'}`,
    monto,
    origen: 'gasto',
    fecha
  });

  return gasto;
}

export function addRetiro(state, { monto, nota = '', fecha = nowISO() }) {
  monto = n(monto);
  if (monto <= 0) throw new Error('Monto inválido');

  addMovimiento(state, {
    tipo: 'egreso',
    categoria: 'retiro',
    concepto: `Retiro ${nota ? `· ${nota}` : ''}`.trim(),
    monto,
    origen: 'patrimonio',
    fecha
  });
}

export function addAporte(state, { monto, nota = '', fecha = nowISO() }) {
  monto = n(monto);
  if (monto <= 0) throw new Error('Monto inválido');

  addMovimiento(state, {
    tipo: 'ingreso',
    categoria: 'aporte',
    concepto: `Aporte ${nota ? `· ${nota}` : ''}`.trim(),
    monto,
    origen: 'patrimonio',
    fecha
  });
}

export function addArqueo(state, { fisico, fecha = nowISO(), nota = '' }) {
  fisico = n(fisico);

  const sistema = saldoCaja(state, fecha);
  const diff = round2(fisico - sistema);

  const arqueo = {
    id: uid(),
    fecha,
    sistema,
    fisico,
    diff,
    nota
  };

  state.arqueos.push(arqueo);

  if (diff > 0) {
    addMovimiento(state, {
      tipo: 'ingreso',
      categoria: 'ajuste_arqueo',
      concepto: 'Sobrante de arqueo',
      monto: diff,
      origen: 'arqueo',
      fecha
    });
  }

  if (diff < 0) {
    addMovimiento(state, {
      tipo: 'egreso',
      categoria: 'ajuste_arqueo',
      concepto: 'Faltante de arqueo',
      monto: Math.abs(diff),
      origen: 'arqueo',
      fecha
    });
  }

  return arqueo;
}

export function addAjuste(state, { productoId, cantidad, motivo = '', fecha = nowISO() }) {
  const prod = state.productos.find((p) => p.id === productoId);
  if (!prod) throw new Error('Producto no encontrado');

  cantidad = n(cantidad);

  const ajuste = {
    id: uid(),
    fecha,
    productoId,
    productoNombre: prod.nombre,
    cantidad,
    motivo,
    costoPerdida: cantidad < 0 ? round2(Math.abs(cantidad) * n(prod.costo)) : 0
  };

  state.ajustes.push(ajuste);
  return ajuste;
}

export function calcPeriodo(state, start, end) {
  const ventas = state.ventas.filter((v) => v.estado !== 'anulada' && inRange(v.fecha, start, end));
  const gastos = state.gastos.filter((g) => inRange(g.fecha, start, end));
  const ajustes = state.ajustes.filter((a) => inRange(a.fecha, start, end));

  const ingresos = round2(ventas.reduce((acc, v) => acc + n(v.total), 0));
  const cogs = round2(ventas.reduce((acc, v) => acc + n(v.costo), 0));
  const gastosTotal = round2(gastos.reduce((acc, g) => acc + n(g.monto), 0));
  const mermas = round2(
    ajustes
      .filter((a) => n(a.cantidad) < 0)
      .reduce((acc, a) => acc + n(a.costoPerdida || 0), 0)
  );

  const bruta = round2(ingresos - cogs);
  const neta = round2(bruta - gastosTotal - mermas);

  return {
    ingresos,
    cogs,
    bruta,
    gastos: gastosTotal,
    mermas,
    neta,
    margenB: ingresos ? round2((bruta / ingresos) * 100) : 0,
    margenN: ingresos ? round2((neta / ingresos) * 100) : 0,
    numVentas: ventas.length
  };
}

export function getCuadre(state, start, end) {
  const rows = state.productos
    .filter((p) => !p.archivado)
    .map((p) => {
      const compras = state.compras.filter((c) => c.productoId === p.id && inRange(c.fecha, start, end));
      const itemsVenta = state.ventas
        .filter((v) => inRange(v.fecha, start, end) && v.estado !== 'anulada')
        .flatMap((v) => v.items)
        .filter((i) => i.productoId === p.id);

      const comprasCantidad = round2(compras.reduce((acc, c) => acc + n(c.cantidad), 0));
      const comprasCosto = round2(compras.reduce((acc, c) => acc + n(c.total), 0));

      const ventasCantidad = round2(itemsVenta.reduce((acc, i) => acc + n(i.cantidad), 0));
      const ingresos = round2(itemsVenta.reduce((acc, i) => acc + n(i.total), 0));
      const costo = round2(itemsVenta.reduce((acc, i) => acc + n(i.cantidad) * n(i.costoUnitario), 0));

      const costoCompraUnitario = comprasCantidad ? round2(comprasCosto / comprasCantidad) : n(p.costo);
      const precioVentaUnitario = ventasCantidad ? round2(ingresos / ventasCantidad) : 0;
      const costoVentaUnitario = ventasCantidad ? round2(costo / ventasCantidad) : 0;

      const stockFinal = round2(stockAtDate(state, p.id, end));
      const valorInventarioProducto = round2(stockFinal * (costoCompraUnitario || n(p.costo)));

      return {
        id: p.id,
        nombre: p.nombre,
        comprasCantidad,
        costoCompraUnitario,
        ventasCantidad,
        precioVentaUnitario,
        costoVentaUnitario,
        ingresos,
        costo,
        ganancia: round2(ingresos - costo),
        stockFinal,
        valorInventario: valorInventarioProducto
      };
    });

  const totals = rows.reduce(
    (acc, r) => {
      acc.comprasCantidad += r.comprasCantidad;
      acc.ventasCantidad += r.ventasCantidad;
      acc.ingresos += r.ingresos;
      acc.costo += r.costo;
      acc.ganancia += r.ganancia;
      acc.stockFinal += r.stockFinal;
      acc.valorInventario += r.valorInventario;
      return acc;
    },
    {
      comprasCantidad: 0,
      ventasCantidad: 0,
      ingresos: 0,
      costo: 0,
      ganancia: 0,
      stockFinal: 0,
      valorInventario: 0
    }
  );

  Object.keys(totals).forEach((k) => (totals[k] = round2(totals[k])));

  return { rows, totals };
}

export function getDiario(state, start, end) {
  const rows = [];

  const add = (fecha, concepto, cuenta, debe, haber) => {
    rows.push({
      fecha,
      concepto,
      cuenta,
      debe: round2(debe),
      haber: round2(haber)
    });
  };

  for (const v of state.ventas.filter((x) => inRange(x.fecha, start, end) && x.estado !== 'anulada')) {
    add(v.fecha, `Venta ${v.id.slice(0, 6)}`, 'Caja', v.total, 0);
    add(v.fecha, `Venta ${v.id.slice(0, 6)}`, 'Ventas', 0, v.total);
    add(v.fecha, `Costo venta ${v.id.slice(0, 6)}`, 'Costo de ventas', v.costo, 0);
    add(v.fecha, `Costo venta ${v.id.slice(0, 6)}`, 'Inventario', 0, v.costo);
  }

  for (const c of state.compras.filter((x) => inRange(x.fecha, start, end))) {
    add(c.fecha, `Compra ${c.productoNombre}`, 'Inventario', c.total, 0);
    add(c.fecha, `Compra ${c.productoNombre}`, 'Caja', 0, c.total);
  }

  for (const g of state.gastos.filter((x) => inRange(x.fecha, start, end))) {
    add(g.fecha, `Gasto ${g.categoria}`, `Gastos - ${g.categoria}`, g.monto, 0);
    add(g.fecha, `Gasto ${g.categoria}`, 'Caja', 0, g.monto);
  }

  for (const m of state.movimientos.filter((x) => x.categoria === 'retiro' && inRange(x.fecha, start, end))) {
    add(m.fecha, m.concepto, 'Retiros', m.monto, 0);
    add(m.fecha, m.concepto, 'Caja', 0, m.monto);
  }

  for (const m of state.movimientos.filter((x) => x.categoria === 'aporte' && inRange(x.fecha, start, end))) {
    add(m.fecha, m.concepto, 'Caja', m.monto, 0);
    add(m.fecha, m.concepto, 'Aportes', 0, m.monto);
  }

  for (const a of state.ajustes.filter((x) => n(x.cantidad) < 0 && inRange(x.fecha, start, end))) {
    add(a.fecha, `Ajuste/merma ${a.productoNombre}`, 'Mermas', a.costoPerdida, 0);
    add(a.fecha, `Ajuste/merma ${a.productoNombre}`, 'Inventario', 0, a.costoPerdida);
  }

  for (const ar of state.arqueos.filter((x) => inRange(x.fecha, start, end))) {
    if (ar.diff > 0) {
      add(ar.fecha, 'Sobrante de arqueo', 'Caja', ar.diff, 0);
      add(ar.fecha, 'Sobrante de arqueo', 'Ajustes de caja', 0, ar.diff);
    }

    if (ar.diff < 0) {
      add(ar.fecha, 'Faltante de arqueo', 'Ajustes de caja', Math.abs(ar.diff), 0);
      add(ar.fecha, 'Faltante de arqueo', 'Caja', 0, Math.abs(ar.diff));
    }
  }

  return rows.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
}

export function getBalance(state) {
  const caja = saldoCaja(state);
  const inventario = valorInventario(state);
  const activos = round2(caja + inventario);

  const aportes = round2(
    state.movimientos
      .filter((m) => m.categoria === 'aporte')
      .reduce((acc, m) => acc + n(m.monto), 0)
  );

  const retiros = round2(
    state.movimientos
      .filter((m) => m.categoria === 'retiro')
      .reduce((acc, m) => acc + n(m.monto), 0)
  );

  const capitalBase = round2(n(state.cfg.capitalInicial) + aportes);

  const gananciasCierres = round2(state.cierres.reduce((acc, c) => acc + n(c.ganancia), 0));
  const periodoActual = calcPeriodo(state, state.cfg.periodoInicio, nowISO());
  const ganancias = round2(gananciasCierres + periodoActual.neta);

  const patrimonio = round2(capitalBase + ganancias - retiros);

  return {
    caja,
    inventario,
    activos,
    capitalBase,
    aportes,
    retiros,
    ganancias,
    patrimonio
  };
}

export function cerrarPeriodo(state) {
  const periodo = calcPeriodo(state, state.cfg.periodoInicio, nowISO());

  const cierre = {
    id: uid(),
    periodo: `${fmtFecha(state.cfg.periodoInicio)} - ${fmtFecha(nowISO())}`,
    fechaCierre: nowISO(),
    totalVentas: periodo.ingresos,
    ganancia: periodo.neta,
    detalle: periodo
  };

  state.cierres.push(cierre);
  state.cfg.periodoInicio = todayISO();

  return cierre;
}

export function calcularReparto(state, monto) {
  const socios = state.socios.filter((s) => s.activo !== false);
  const totalPct = round2(socios.reduce((acc, s) => acc + n(s.porcentaje), 0));

  return socios.map((s) => ({
    ...s,
    monto: totalPct ? round2((n(monto) * n(s.porcentaje)) / totalPct) : 0
  }));
}

export function detectarAnomalias(state) {
  const res = [];

  const caja = saldoCaja(state);
  if (caja < 0) {
    res.push({
      id: 'caja-negativa',
      nivel: 'alta',
      mensaje: `Caja negativa: ${fmt(caja)}`
    });
  }

  for (const p of state.productos.filter((x) => !x.archivado)) {
    const stock = stockAtDate(state, p.id, nowISO());

    if (stock <= 0) {
      res.push({
        id: `agotado-${p.id}`,
        nivel: 'media',
        mensaje: `${p.nombre} está agotado`
      });
    } else if (stock <= n(p.stockMin)) {
      res.push({
        id: `bajo-stock-${p.id}`,
        nivel: 'media',
        mensaje: `${p.nombre} bajo stock: ${fmtCant(stock)} ${p.unidad || ''}`
      });
    }
  }

  for (const v of state.ventas) {
    for (const item of v.items) {
      if (n(item.precio) < n(item.costoUnitario)) {
        res.push({
          id: `venta-bajo-costo-${v.id}-${item.productoId}`,
          nivel: 'alta',
          mensaje: `Venta de ${item.nombre} debajo del costo`
        });
      }
    }
  }

  const inicio = new Date(state.cfg.periodoInicio).getTime();
  const dias = Math.floor((Date.now() - inicio) / 86400000);

  if (dias > n(state.cfg.diasCierre)) {
    res.push({
      id: 'cierre-pendiente',
      nivel: 'media',
      mensaje: `Cierre pendiente: periodo abierto hace ${dias} días`
    });
  }

  return res;
}
