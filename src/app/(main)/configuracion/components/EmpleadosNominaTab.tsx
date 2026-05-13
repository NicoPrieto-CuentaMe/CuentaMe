"use client";

import type { Empleado, Nomina, RolEmpleado, TipoContrato } from "@prisma/client";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal, useFormState } from "react-dom";
import { useRouter } from "next/navigation";
import {
  addEmpleado,
  addNomina,
  deleteEmpleado,
  deleteNomina,
  updateEmpleado,
  updateNomina,
  type ActionState,
} from "../actions";
import { calcularNomina, ROL_LABELS, TIPO_CONTRATO_LABELS } from "@/lib/nomina-constants";
import { digitsToSalePriceString, formatCopFromDigits, precioVentaToDigits } from "../cop-price";
import { ColumnHeader } from "@/components/ui/ColumnHeader";

const initialState: ActionState = { ok: true };
const idle: ActionState = { ok: true };

const ROL_KEYS = Object.keys(ROL_LABELS) as RolEmpleado[];
const TIPO_KEYS = Object.keys(TIPO_CONTRATO_LABELS) as TipoContrato[];

function FieldError({ state, field }: { state: ActionState; field: string }) {
  if (!("ok" in state) || state.ok || state.field !== field) return null;
  return <p className="mt-1 text-xs text-danger">{state.message}</p>;
}

function todayMonthLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function dateToMonthInput(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatPeriodo(d: Date): string {
  const t = new Intl.DateTimeFormat("es-CO", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function formatCopN(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

export type NominaConEmpleado = Nomina & { empleado: { nombre: string } };

export function EmpleadosNominaTab({
  empleadosInicial,
  nominasInicial,
}: {
  empleadosInicial: Empleado[];
  nominasInicial: NominaConEmpleado[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [addEmpState, addEmpAction] = useFormState(addEmpleado, initialState);
  const [addEmpKey, setAddEmpKey] = useState(0);

  const [addNomState, addNomAction] = useFormState(addNomina, initialState);
  const nomState = addNomState;

  const [editingEmpId, setEditingEmpId] = useState<string | null>(null);
  const [empDraft, setEmpDraft] = useState<{
    nombre: string;
    rol: RolEmpleado;
    tipoContrato: TipoContrato;
  } | null>(null);
  const [deleteEmpId, setDeleteEmpId] = useState<string | null>(null);
  const [saveEmpError, setSaveEmpError] = useState<string | null>(null);
  const [deleteEmpError, setDeleteEmpError] = useState<string | null>(null);

  const [empNombre, setEmpNombre] = useState("");
  const [empRol, setEmpRol] = useState<RolEmpleado | "">("");
  const [empTipo, setEmpTipo] = useState<TipoContrato | "">("");
  const [empJustAdded, setEmpJustAdded] = useState(false);
  const [empLastName, setEmpLastName] = useState("");
  const empNameRef = useRef<HTMLInputElement>(null);

  const [createNomEmpleadoId, setCreateNomEmpleadoId] = useState("");
  const [createNomPeriodo, setCreateNomPeriodo] = useState(todayMonthLocal);
  const [createSalarioDigits, setCreateSalarioDigits] = useState("");
  const [createHorasExtraDigits, setCreateHorasExtraDigits] = useState("");
  const [createOtrosIngresosDigits, setCreateOtrosIngresosDigits] = useState("");
  const [createOtrasDedDigits, setCreateOtrasDedDigits] = useState("");
  const [createNomNotas, setCreateNomNotas] = useState("");
  const [overrideDedSalud, setOverrideDedSalud] = useState("");
  const [overrideDedPension, setOverrideDedPension] = useState("");
  const [overrideSS, setOverrideSS] = useState("");
  const [overridePara, setOverridePara] = useState("");
  const [overrideProv, setOverrideProv] = useState("");
  const [overrideAuxilio, setOverrideAuxilio] = useState("");
  const [deleteNomId, setDeleteNomId] = useState<string | null>(null);
  const [nominasVisibleCount, setNominasVisibleCount] = useState(10);
  const [nominasSortColumn, setNominasSortColumn] = useState<string | null>(null);
  const [nominasSortDirection, setNominasSortDirection] = useState<"asc" | "desc">("asc");
  const [nominasColumnSearch, setNominasColumnSearch] = useState<Record<string, string>>({});
  const [empDrawerOpen, setEmpDrawerOpen] = useState(false);
  const [nomDrawerOpen, setNomDrawerOpen] = useState(false);

  const [editNomId, setEditNomId] = useState<string | null>(null);
  const [editNomDraft, setEditNomDraft] = useState<{
    empleadoId: string;
    periodo: string;
    salarioBase: string;
    horasExtra: string;
    otrosIngresos: string;
    otrasDeduciones: string;
    notas: string;
  } | null>(null);
  const [editNomError, setEditNomError] = useState<string | null>(null);
  const [editNomPending, startEditNomTransition] = useTransition();
  const [editOverrides, setEditOverrides] = useState<Record<string, string>>({});

  const preview = useMemo(() => {
    const salario = Number(digitsToSalePriceString(createSalarioDigits)) || 0;
    const hx = Number(digitsToSalePriceString(createHorasExtraDigits)) || 0;
    const oi = Number(digitsToSalePriceString(createOtrosIngresosDigits)) || 0;
    const od = Number(digitsToSalePriceString(createOtrasDedDigits)) || 0;
    if (salario <= 0) return null;
    const base = calcularNomina({ salarioBase: salario, horasExtra: hx, otrosIngresos: oi, otrasDeduciones: od });
    const auxilio = overrideAuxilio !== "" ? Number(digitsToSalePriceString(overrideAuxilio)) || 0 : base.auxilio;
    const dedSalud = overrideDedSalud !== "" ? Number(digitsToSalePriceString(overrideDedSalud)) || 0 : base.dedSalud;
    const dedPension = overrideDedPension !== "" ? Number(digitsToSalePriceString(overrideDedPension)) || 0 : base.dedPension;
    const ss = overrideSS !== "" ? Number(digitsToSalePriceString(overrideSS)) || 0 : base.ss;
    const para = overridePara !== "" ? Number(digitsToSalePriceString(overridePara)) || 0 : base.para;
    const prov = overrideProv !== "" ? Number(digitsToSalePriceString(overrideProv)) || 0 : base.prov;
    const neto = salario + auxilio + hx + oi - dedSalud - dedPension - od;
    const costoTotal = neto + ss + para + prov;
    return { auxilio, dedSalud, dedPension, ss, para, prov, neto, costoTotal };
  }, [
    createSalarioDigits,
    createHorasExtraDigits,
    createOtrosIngresosDigits,
    createOtrasDedDigits,
    overrideAuxilio,
    overrideDedSalud,
    overrideDedPension,
    overrideSS,
    overridePara,
    overrideProv,
  ]);

  const salarioHidden = digitsToSalePriceString(createSalarioDigits);
  const horasHidden = digitsToSalePriceString(createHorasExtraDigits);
  const otrosHidden = digitsToSalePriceString(createOtrosIngresosDigits);
  const otrasDedHidden = digitsToSalePriceString(createOtrasDedDigits);

  const salarioFmt = formatCopFromDigits(createSalarioDigits);
  const horasFmt = formatCopFromDigits(createHorasExtraDigits);
  const otrosFmt = formatCopFromDigits(createOtrosIngresosDigits);
  const otrasDedFmt = formatCopFromDigits(createOtrasDedDigits);

  const empNombreRef = useRef(empNombre);
  empNombreRef.current = empNombre;

  useEffect(() => {
    if (!addEmpState.ok || !addEmpState.message) return;
    setEmpLastName(empNombreRef.current);
    setEmpNombre("");
    setEmpRol("");
    setEmpTipo("");
    setEmpJustAdded(true);
    setTimeout(() => setEmpJustAdded(false), 480);
    setTimeout(() => empNameRef.current?.focus(), 50);
    setAddEmpKey((k) => k + 1);
    router.refresh();
  }, [addEmpState, router]);

  useEffect(() => {
    if (!addNomState.ok || !addNomState.message) return;
    setCreateNomEmpleadoId("");
    setCreateNomPeriodo(todayMonthLocal());
    setCreateSalarioDigits("");
    setCreateHorasExtraDigits("");
    setCreateOtrosIngresosDigits("");
    setCreateOtrasDedDigits("");
    setCreateNomNotas("");
    setOverrideDedSalud("");
    setOverrideDedPension("");
    setOverrideSS("");
    setOverridePara("");
    setOverrideProv("");
    setOverrideAuxilio("");
    router.refresh();
  }, [addNomState, router]);

  const beginEditEmp = useCallback((e: Empleado) => {
    setSaveEmpError(null);
    setEditingEmpId(e.id);
    setEmpDraft({
      nombre: e.nombre,
      rol: e.rol,
      tipoContrato: e.tipoContrato,
    });
    setDeleteEmpId(null);
  }, []);

  const cancelEditEmp = useCallback(() => {
    setSaveEmpError(null);
    setEditingEmpId(null);
    setEmpDraft(null);
  }, []);

  const saveEmp = useCallback(() => {
    if (!editingEmpId || !empDraft) return;
    const fd = new FormData();
    fd.set("id", editingEmpId);
    fd.set("nombre", empDraft.nombre);
    fd.set("rol", empDraft.rol);
    fd.set("tipoContrato", empDraft.tipoContrato);
    startTransition(async () => {
      const res = await updateEmpleado(idle, fd);
      if (res.ok) {
        setSaveEmpError(null);
        setEditingEmpId(null);
        setEmpDraft(null);
        router.refresh();
      } else {
        setSaveEmpError(res.message ?? "No se pudo guardar.");
      }
    });
  }, [editingEmpId, empDraft, router]);

  const confirmDeleteEmp = useCallback(
    (id: string) => {
      const fd = new FormData();
      fd.set("id", id);
      startTransition(async () => {
        const res = await deleteEmpleado(fd);
        if (res.ok) {
          setDeleteEmpId(null);
          setDeleteEmpError(null);
          router.refresh();
        } else {
          setDeleteEmpError(res.message ?? "No se pudo eliminar.");
        }
      });
    },
    [router],
  );

  const beginEditNom = useCallback((row: NominaConEmpleado) => {
    setEditOverrides({});
    setEditNomId(row.id);
    setEditNomError(null);
    setEditNomDraft({
      empleadoId: row.empleadoId,
      periodo: dateToMonthInput(row.periodo),
      salarioBase: precioVentaToDigits(row.salarioBase),
      horasExtra: precioVentaToDigits(row.horasExtra),
      otrosIngresos: precioVentaToDigits(row.otrosIngresos),
      otrasDeduciones: precioVentaToDigits(row.otrasDeduciones),
      notas: row.notas ?? "",
    });
    setDeleteNomId(null);
  }, []);

  const cancelEditNom = useCallback(() => {
    setEditOverrides({});
    setEditNomId(null);
    setEditNomDraft(null);
    setEditNomError(null);
  }, []);

  const saveEditNom = useCallback(
    (id: string) => {
      if (!editNomDraft) return;
      const fd = new FormData();
      fd.set("id", id);
      fd.set("empleadoId", editNomDraft.empleadoId);
      fd.set("periodo", editNomDraft.periodo);
      fd.set("salarioBase", digitsToSalePriceString(editNomDraft.salarioBase));
      fd.set("horasExtra", digitsToSalePriceString(editNomDraft.horasExtra));
      fd.set("otrosIngresos", digitsToSalePriceString(editNomDraft.otrosIngresos));
      fd.set("otrasDeduciones", digitsToSalePriceString(editNomDraft.otrasDeduciones));
      fd.set("notas", editNomDraft.notas);
      startEditNomTransition(async () => {
        const res = await updateNomina(idle, fd);
        if (res.ok) {
          cancelEditNom();
          router.refresh();
        } else {
          setEditNomError(res.message ?? "No se pudo guardar.");
        }
      });
    },
    [editNomDraft, cancelEditNom, router],
  );

  const editNomPreview = useMemo(() => {
    if (!editNomDraft) return null;
    const salario = Number(digitsToSalePriceString(editNomDraft.salarioBase)) || 0;
    const hx = Number(digitsToSalePriceString(editNomDraft.horasExtra)) || 0;
    const oi = Number(digitsToSalePriceString(editNomDraft.otrosIngresos)) || 0;
    const od = Number(digitsToSalePriceString(editNomDraft.otrasDeduciones)) || 0;
    if (salario <= 0) return null;
    const base = calcularNomina({
      salarioBase: salario,
      horasExtra: hx,
      otrosIngresos: oi,
      otrasDeduciones: od,
    });
    const pick = (key: "auxilio" | "dedSalud" | "dedPension" | "ss" | "para" | "prov", baseVal: number) => {
      const o = editOverrides[key];
      return o !== undefined && o !== "" ? Number(digitsToSalePriceString(o)) || 0 : baseVal;
    };
    const auxilio = pick("auxilio", base.auxilio);
    const dedSalud = pick("dedSalud", base.dedSalud);
    const dedPension = pick("dedPension", base.dedPension);
    const ss = pick("ss", base.ss);
    const para = pick("para", base.para);
    const prov = pick("prov", base.prov);
    const neto = salario + auxilio + hx + oi - dedSalud - dedPension - od;
    const costoTotal = neto + ss + para + prov;
    return { auxilio, dedSalud, dedPension, ss, para, prov, neto, costoTotal };
  }, [editNomDraft, editOverrides]);

  const confirmDeleteNom = useCallback(
    (id: string) => {
      const fd = new FormData();
      fd.set("id", id);
      startTransition(async () => {
        const res = await deleteNomina(idle, fd);
        if (res.ok) {
          setDeleteNomId(null);
          if (editNomId === id) cancelEditNom();
          router.refresh();
        }
      });
    },
    [router, editNomId, cancelEditNom],
  );

  const filtradasNominas = useMemo(() => nominasInicial, [nominasInicial]);

  const filtradasNominasPorCol = useMemo(() => {
    return filtradasNominas.filter((row) => {
      const qE = (nominasColumnSearch.empleado ?? "").trim().toLowerCase();
      if (qE && !row.empleado.nombre.toLowerCase().includes(qE)) return false;
      const qP = (nominasColumnSearch.periodo ?? "").trim().toLowerCase();
      if (qP && !formatPeriodo(row.periodo).toLowerCase().includes(qP)) return false;
      const qS = (nominasColumnSearch.salarioBase ?? "").trim().toLowerCase();
      if (qS && !formatCopN(Number(row.salarioBase)).toLowerCase().includes(qS)) return false;
      const qN = (nominasColumnSearch.netoEmpleado ?? "").trim().toLowerCase();
      if (qN && !formatCopN(Number(row.netoEmpleado)).toLowerCase().includes(qN)) return false;
      const qC = (nominasColumnSearch.costoTotal ?? "").trim().toLowerCase();
      if (qC && !formatCopN(Number(row.costoTotalEmpleador)).toLowerCase().includes(qC)) return false;
      return true;
    });
  }, [filtradasNominas, nominasColumnSearch]);

  const nominasOrdenadas = useMemo(() => {
    if (!nominasSortColumn) return filtradasNominasPorCol;
    const arr = [...filtradasNominasPorCol];
    const m = nominasSortDirection === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (nominasSortColumn) {
        case "empleado":
          return a.empleado.nombre.localeCompare(b.empleado.nombre, "es") * m;
        case "periodo":
          return (a.periodo.getTime() - b.periodo.getTime()) * m;
        case "salarioBase":
          return (Number(a.salarioBase) - Number(b.salarioBase)) * m;
        case "netoEmpleado":
          return (Number(a.netoEmpleado) - Number(b.netoEmpleado)) * m;
        case "costoTotal":
          return (Number(a.costoTotalEmpleador) - Number(b.costoTotalEmpleador)) * m;
        default:
          return 0;
      }
    });
    return arr;
  }, [filtradasNominasPorCol, nominasSortColumn, nominasSortDirection]);

  const nominasAMostrar = useMemo(
    () => nominasOrdenadas.slice(0, nominasVisibleCount),
    [nominasOrdenadas, nominasVisibleCount],
  );

  const onSortNominas = useCallback((key: string, dir: "asc" | "desc") => {
    setNominasSortColumn(key);
    setNominasSortDirection(dir);
    setNominasVisibleCount(10);
  }, []);

  const onSearchNominas = useCallback((key: string, value: string) => {
    setNominasColumnSearch((prev) => ({ ...prev, [key]: value }));
    setNominasVisibleCount(10);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ══ SECCIÓN EMPLEADOS ══════════════════════════════════ */}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={() => setEmpDrawerOpen((o) => !o)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            height: 32,
            padding: "0 12px",
            background: empDrawerOpen ? "rgba(94,106,210,0.18)" : "rgba(255,255,255,0.03)",
            border: "1px solid",
            borderColor: empDrawerOpen ? "rgba(113,112,255,0.30)" : "rgba(255,255,255,0.08)",
            borderRadius: 8,
            color: empDrawerOpen ? "#a4adff" : "#d0d6e0",
            font: "510 12px/1 Inter,sans-serif",
            cursor: "pointer",
            transition: "all 150ms cubic-bezier(0.16,1,0.3,1)",
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
          </svg>
          <span>Mi equipo</span>
          <span
            style={{
              font: "510 11px/1 Inter,sans-serif",
              color: empDrawerOpen ? "#a4adff" : "#8a8f98",
              background: empDrawerOpen ? "rgba(113,112,255,0.20)" : "rgba(255,255,255,0.05)",
              padding: "3px 7px",
              borderRadius: 999,
              minWidth: 20,
              textAlign: "center",
            }}
          >
            {empleadosInicial.length}
          </span>
        </button>
      </div>

      <section
        style={{
          position: "relative",
          background: "linear-gradient(180deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.015) 100%)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 18,
          padding: "28px 32px 22px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
          boxShadow: "0 24px 60px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        {/* Eyebrow */}
        <div
          style={{
            font: "590 10px/1 Inter,sans-serif",
            color: "#62666d",
            letterSpacing: "1.6px",
            textTransform: "uppercase",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          NUEVO EMPLEADO
          {empJustAdded && empLastName && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                color: "#a4ffb8",
                font: "510 10px/1 Inter,sans-serif",
                letterSpacing: "0.4px",
                textTransform: "none",
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              {empLastName} agregado
            </span>
          )}
        </div>

        <form key={addEmpKey} action={addEmpAction} style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <input type="hidden" name="nombre" value={empNombre} />
          <input type="hidden" name="rol" value={empRol} />
          <input type="hidden" name="tipoContrato" value={empTipo} />

          {/* Nombre — input grande */}
          <div style={{ position: "relative" }}>
            <input
              ref={empNameRef}
              value={empNombre}
              onChange={(e) => setEmpNombre(e.target.value)}
              placeholder="¿Cómo se llama?"
              autoComplete="off"
              spellCheck={false}
              maxLength={100}
              style={{
                width: "100%",
                background: "transparent",
                border: "none",
                outline: "none",
                color: "#f7f8f8",
                font: "590 38px/1.15 Inter,sans-serif",
                letterSpacing: "-1.2px",
                padding: "4px 0 10px",
              }}
            />
            <div style={{ height: 2, width: "100%", background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  background: "linear-gradient(90deg,#5e6ad2,#7170ff)",
                  borderRadius: 2,
                  width: empNombre.trim() ? "100%" : "0%",
                  transition: "width 320ms cubic-bezier(0.16,1,0.3,1)",
                }}
              />
            </div>
            <FieldError state={addEmpState} field="nombre" />
          </div>

          {/* Rol — chips */}
          <div
            style={{
              opacity: empNombre.trim() ? 1 : 0.35,
              pointerEvents: empNombre.trim() ? "auto" : "none",
              transition: "opacity 220ms",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                font: "510 11px/1 Inter,sans-serif",
                color: "#8a8f98",
                marginBottom: 10,
              }}
            >
              <span>
                Rol <span style={{ color: "#7170ff" }}>*</span>
              </span>
              <span style={{ color: "#62666d" }}>{empRol ? ROL_LABELS[empRol as RolEmpleado] : "¿Cuál es su función?"}</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {ROL_KEYS.map((k) => {
                const on = empRol === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setEmpRol(on ? "" : k)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      height: 32,
                      padding: "0 13px",
                      background: on ? "rgba(113,112,255,0.16)" : "rgba(255,255,255,0.03)",
                      border: "1px solid",
                      borderColor: on ? "rgba(113,112,255,0.45)" : "rgba(255,255,255,0.08)",
                      borderRadius: 999,
                      color: on ? "#fff" : "#d0d6e0",
                      font: "510 13px/1 Inter,sans-serif",
                      cursor: "pointer",
                      transition: "all 150ms cubic-bezier(0.16,1,0.3,1)",
                      boxShadow: on ? "inset 0 1px 0 rgba(255,255,255,0.08)" : "none",
                    }}
                  >
                    {on && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
                    {ROL_LABELS[k]}
                  </button>
                );
              })}
            </div>
            <FieldError state={addEmpState} field="rol" />
          </div>

          {/* Tipo contrato — chips */}
          <div
            style={{
              opacity: empNombre.trim() ? 1 : 0.35,
              pointerEvents: empNombre.trim() ? "auto" : "none",
              transition: "opacity 220ms",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                font: "510 11px/1 Inter,sans-serif",
                color: "#8a8f98",
                marginBottom: 10,
              }}
            >
              <span>
                Tipo de contrato <span style={{ color: "#7170ff" }}>*</span>
              </span>
              <span style={{ color: "#62666d" }}>{empTipo ? TIPO_CONTRATO_LABELS[empTipo as TipoContrato] : "¿Qué tipo de vinculación?"}</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {TIPO_KEYS.map((k) => {
                const on = empTipo === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setEmpTipo(on ? "" : k)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      height: 32,
                      padding: "0 13px",
                      background: on ? "rgba(113,112,255,0.16)" : "rgba(255,255,255,0.03)",
                      border: "1px solid",
                      borderColor: on ? "rgba(113,112,255,0.45)" : "rgba(255,255,255,0.08)",
                      borderRadius: 999,
                      color: on ? "#fff" : "#d0d6e0",
                      font: "510 13px/1 Inter,sans-serif",
                      cursor: "pointer",
                      transition: "all 150ms cubic-bezier(0.16,1,0.3,1)",
                      boxShadow: on ? "inset 0 1px 0 rgba(255,255,255,0.08)" : "none",
                    }}
                  >
                    {on && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
                    {TIPO_CONTRATO_LABELS[k]}
                  </button>
                );
              })}
            </div>
            <FieldError state={addEmpState} field="tipoContrato" />
          </div>

          {/* Footer */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingTop: 14,
              borderTop: "1px solid rgba(255,255,255,0.05)",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "400 12px/1 Inter,sans-serif", color: "#8a8f98" }}>
              <span style={{ color: empNombre.trim() ? "#a4adff" : "#4a4d54" }}>●</span>
              <span style={{ color: empRol ? "#a4adff" : "#4a4d54" }}>●</span>
              <span style={{ color: empTipo ? "#a4adff" : "#4a4d54" }}>●</span>
              <span style={{ marginLeft: 4 }}>
                {!empNombre.trim() ? "Empieza por el nombre" : !empRol ? "¿Cuál es su rol?" : !empTipo ? "¿Tipo de contrato?" : "Listo para agregar"}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {addEmpState.ok === false && !addEmpState.field ? (
                <span style={{ font: "400 12px/1 Inter,sans-serif", color: "#f87171" }}>{addEmpState.message}</span>
              ) : null}
              <button
                type="submit"
                disabled={!empNombre.trim() || !empRol || !empTipo}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  height: 38,
                  padding: "0 18px",
                  background: empNombre.trim() && empRol && empTipo ? "linear-gradient(180deg,#6b78de,#5e6ad2)" : "rgba(255,255,255,0.04)",
                  border: "1px solid",
                  borderColor: empNombre.trim() && empRol && empTipo ? "rgba(113,112,255,0.5)" : "rgba(255,255,255,0.06)",
                  borderRadius: 10,
                  color: empNombre.trim() && empRol && empTipo ? "#fff" : "#62666d",
                  font: "590 13px/1 Inter,sans-serif",
                  cursor: empNombre.trim() && empRol && empTipo ? "pointer" : "not-allowed",
                  boxShadow:
                    empNombre.trim() && empRol && empTipo ? "inset 0 1px 0 rgba(255,255,255,0.16), 0 4px 14px rgba(94,106,210,0.32)" : "none",
                  transition: "all 150ms cubic-bezier(0.16,1,0.3,1)",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
                Agregar empleado
              </button>
            </div>
          </div>
        </form>
      </section>

      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 80,
          transform: empDrawerOpen ? "translateY(0)" : "translateY(100%)",
          transition: "transform 300ms cubic-bezier(0.16,1,0.3,1)",
          display: "flex",
          flexDirection: "column",
          maxHeight: "55vh",
          background: "#0c0d0e",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 -24px 60px rgba(0,0,0,0.5)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 20px 12px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ font: "590 15px/1.2 Inter,sans-serif", color: "#f7f8f8", letterSpacing: "-0.2px" }}>Mi equipo</span>
            <span style={{ font: "510 11px/1 Inter,sans-serif", color: "#8a8f98", background: "rgba(255,255,255,0.04)", padding: "3px 8px", borderRadius: 999 }}>
              {empleadosInicial.length}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setEmpDrawerOpen(false)}
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#8a8f98",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-label="Cerrar"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {empleadosInicial.length === 0 ? (
            <div style={{ padding: "32px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textAlign: "center" }}>
              <p style={{ font: "510 14px/1.4 Inter,sans-serif", color: "#d0d6e0", margin: 0 }}>Aún no has registrado empleados</p>
              <p style={{ font: "400 13px/1.4 Inter,sans-serif", color: "#62666d", margin: 0 }}>Agrega uno arriba para empezar</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "10px 20px",
                  background: "rgba(255,255,255,0.015)",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                {(
                  [
                    ["Nombre", "1 1 0"],
                    ["Rol", "0 0 180px"],
                    ["Tipo contrato", "0 0 200px"],
                    ["Acciones", "0 0 190px"],
                  ] as const
                ).map(([l, f]) => (
                  <div key={l} style={{ flex: f, display: "flex", justifyContent: l === "Acciones" ? "flex-end" : "flex-start" }}>
                    <span style={{ font: "510 11px/1 Inter,sans-serif", color: "#8a8f98", letterSpacing: "0.5px", textTransform: "uppercase" }}>{l}</span>
                  </div>
                ))}
              </div>
              {empleadosInicial.map((row) => {
                const isDeleting = deleteEmpId === row.id;
                return (
                  <div
                    key={row.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 16,
                      padding: "12px 20px",
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                      background: isDeleting ? "rgba(224,82,82,0.06)" : "transparent",
                    }}
                  >
                    <div style={{ flex: "1 1 0" }}>
                      <span style={{ font: "510 13px/1 Inter,sans-serif", color: "#f7f8f8" }}>{row.nombre}</span>
                    </div>
                    <div style={{ flex: "0 0 180px" }}>
                      <span style={{ font: "400 13px/1 Inter,sans-serif", color: "#d0d6e0" }}>{ROL_LABELS[row.rol]}</span>
                    </div>
                    <div style={{ flex: "0 0 200px" }}>
                      <span style={{ font: "400 13px/1 Inter,sans-serif", color: "#d0d6e0" }}>{TIPO_CONTRATO_LABELS[row.tipoContrato]}</span>
                    </div>
                    <div style={{ flex: "0 0 190px", display: "flex", justifyContent: "flex-end", gap: 6 }}>
                      {isDeleting ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteEmpId(null);
                              setDeleteEmpError(null);
                            }}
                            style={{
                              height: 28,
                              padding: "0 10px",
                              background: "rgba(255,255,255,0.04)",
                              border: "1px solid rgba(255,255,255,0.06)",
                              borderRadius: 6,
                              color: "#d0d6e0",
                              font: "510 12px/1 Inter,sans-serif",
                              cursor: "pointer",
                            }}
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => confirmDeleteEmp(row.id)}
                            style={{
                              height: 28,
                              padding: "0 10px",
                              background: "rgba(224,82,82,0.22)",
                              border: "1px solid rgba(224,82,82,0.4)",
                              borderRadius: 6,
                              color: "#ff8585",
                              font: "510 12px/1 Inter,sans-serif",
                              cursor: "pointer",
                            }}
                          >
                            Confirmar
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => beginEditEmp(row)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                              height: 28,
                              padding: "0 10px",
                              background: "rgba(255,255,255,0.04)",
                              border: "1px solid rgba(255,255,255,0.06)",
                              borderRadius: 6,
                              color: "#d0d6e0",
                              font: "510 12px/1 Inter,sans-serif",
                              cursor: "pointer",
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              cancelEditEmp();
                              setDeleteEmpError(null);
                              setDeleteEmpId(row.id);
                            }}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                              height: 28,
                              padding: "0 10px",
                              background: "rgba(224,82,82,0.14)",
                              border: "1px solid rgba(224,82,82,0.30)",
                              borderRadius: 6,
                              color: "#ff8585",
                              font: "510 12px/1 Inter,sans-serif",
                              cursor: "pointer",
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                              <path d="M10 11v6M14 11v6" />
                            </svg>
                            Eliminar
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {saveEmpError ? <p style={{ padding: "8px 20px", font: "400 12px/1 Inter,sans-serif", color: "#f87171" }}>{saveEmpError}</p> : null}
          {deleteEmpError ? <p style={{ padding: "8px 20px", font: "400 12px/1 Inter,sans-serif", color: "#f87171" }}>{deleteEmpError}</p> : null}
        </div>
      </div>

      {/* ══ SECCIÓN NÓMINA ════════════════════════════════════ */}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={() => setNomDrawerOpen((o) => !o)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            height: 32,
            padding: "0 12px",
            background: nomDrawerOpen ? "rgba(94,106,210,0.18)" : "rgba(255,255,255,0.03)",
            border: "1px solid",
            borderColor: nomDrawerOpen ? "rgba(113,112,255,0.30)" : "rgba(255,255,255,0.08)",
            borderRadius: 8,
            color: nomDrawerOpen ? "#a4adff" : "#d0d6e0",
            font: "510 12px/1 Inter,sans-serif",
            cursor: "pointer",
            transition: "all 150ms cubic-bezier(0.16,1,0.3,1)",
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <rect x="5" y="2" width="14" height="20" rx="2" />
            <path d="M9 7h6M9 11h6M9 15h4" />
          </svg>
          <span>Historial nóminas</span>
          <span
            style={{
              font: "510 11px/1 Inter,sans-serif",
              color: nomDrawerOpen ? "#a4adff" : "#8a8f98",
              background: nomDrawerOpen ? "rgba(113,112,255,0.20)" : "rgba(255,255,255,0.05)",
              padding: "3px 7px",
              borderRadius: 999,
              minWidth: 20,
              textAlign: "center",
            }}
          >
            {nominasInicial.length}
          </span>
        </button>
      </div>

      <section
        style={{
          position: "relative",
          background: "linear-gradient(180deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.015) 100%)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 18,
          padding: "28px 32px 22px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
          boxShadow: "0 24px 60px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        {/* Eyebrow */}
        <div style={{ font: "590 10px/1 Inter,sans-serif", color: "#62666d", letterSpacing: "1.6px", textTransform: "uppercase" }}>
          REGISTRAR NÓMINA
        </div>

        <form action={addNomAction} style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <input type="hidden" name="salarioBase" value={salarioHidden} />
          <input type="hidden" name="horasExtra" value={horasHidden} />
          <input type="hidden" name="otrosIngresos" value={otrosHidden} />
          <input type="hidden" name="otrasDeduciones" value={otrasDedHidden} />
          <input type="hidden" name="empleadoId" value={createNomEmpleadoId} />
          <input type="hidden" name="periodo" value={createNomPeriodo} />
          {preview && (
            <>
              <input type="hidden" name="deduccionSaludOverride" value={overrideDedSalud !== "" ? digitsToSalePriceString(overrideDedSalud) : ""} />
              <input type="hidden" name="deduccionPensionOverride" value={overrideDedPension !== "" ? digitsToSalePriceString(overrideDedPension) : ""} />
              <input type="hidden" name="ssOverride" value={overrideSS !== "" ? digitsToSalePriceString(overrideSS) : ""} />
              <input type="hidden" name="paraOverride" value={overridePara !== "" ? digitsToSalePriceString(overridePara) : ""} />
              <input type="hidden" name="provOverride" value={overrideProv !== "" ? digitsToSalePriceString(overrideProv) : ""} />
              <input type="hidden" name="auxilioOverride" value={overrideAuxilio !== "" ? digitsToSalePriceString(overrideAuxilio) : ""} />
            </>
          )}

          {/* Empleado — chips */}
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                font: "510 11px/1 Inter,sans-serif",
                color: "#8a8f98",
                marginBottom: 10,
              }}
            >
              <span>
                ¿Para quién es esta nómina? <span style={{ color: "#7170ff" }}>*</span>
              </span>
              <span style={{ color: "#62666d" }}>
                {createNomEmpleadoId ? (empleadosInicial.find((e) => e.id === createNomEmpleadoId)?.nombre ?? "") : "Selecciona un empleado"}
              </span>
            </div>
            {empleadosInicial.length === 0 ? (
              <p style={{ font: "400 12px/1 Inter,sans-serif", color: "#62666d" }}>Agrega empleados primero</p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {empleadosInicial.map((e) => {
                  const on = createNomEmpleadoId === e.id;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => setCreateNomEmpleadoId(on ? "" : e.id)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        height: 32,
                        padding: "0 13px",
                        background: on ? "rgba(113,112,255,0.16)" : "rgba(255,255,255,0.03)",
                        border: "1px solid",
                        borderColor: on ? "rgba(113,112,255,0.45)" : "rgba(255,255,255,0.08)",
                        borderRadius: 999,
                        color: on ? "#fff" : "#d0d6e0",
                        font: "510 13px/1 Inter,sans-serif",
                        cursor: "pointer",
                        transition: "all 150ms cubic-bezier(0.16,1,0.3,1)",
                        boxShadow: on ? "inset 0 1px 0 rgba(255,255,255,0.08)" : "none",
                      }}
                    >
                      {on && (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      )}
                      {e.nombre}
                    </button>
                  );
                })}
              </div>
            )}
            <FieldError state={nomState} field="empleadoId" />
          </div>

          {/* Período */}
          <div
            style={{
              opacity: createNomEmpleadoId ? 1 : 0.35,
              pointerEvents: createNomEmpleadoId ? "auto" : "none",
              transition: "opacity 220ms",
            }}
          >
            <div style={{ font: "510 11px/1 Inter,sans-serif", color: "#8a8f98", marginBottom: 10 }}>
              Período <span style={{ color: "#7170ff" }}>*</span>
            </div>
            <input
              type="month"
              value={createNomPeriodo}
              onChange={(e) => setCreateNomPeriodo(e.target.value)}
              required
              style={{
                height: 38,
                padding: "0 12px",
                background: "rgba(0,0,0,0.30)",
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: 8,
                color: "#f7f8f8",
                font: "510 14px/1 Inter,sans-serif",
                outline: "none",
              }}
            />
            <FieldError state={nomState} field="periodo" />
          </div>

          {/* Salario base — número grande */}
          <div
            style={{
              opacity: createNomEmpleadoId ? 1 : 0.35,
              pointerEvents: createNomEmpleadoId ? "auto" : "none",
              transition: "opacity 220ms",
            }}
          >
            <div style={{ font: "510 11px/1 Inter,sans-serif", color: "#8a8f98", marginBottom: 10 }}>
              Salario base <span style={{ color: "#7170ff" }}>*</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ font: "590 28px/1 Inter,sans-serif", color: "#62666d" }}>$</span>
              <input
                inputMode="numeric"
                value={salarioFmt}
                onChange={(e) => setCreateSalarioDigits(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="0"
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "#f7f8f8",
                  font: "590 38px/1.15 Inter,sans-serif",
                  letterSpacing: "-1.2px",
                  padding: "4px 0 10px",
                }}
              />
            </div>
            <div style={{ height: 2, width: "100%", background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  background: "linear-gradient(90deg,#5e6ad2,#7170ff)",
                  borderRadius: 2,
                  width: createSalarioDigits ? "100%" : "0%",
                  transition: "width 320ms cubic-bezier(0.16,1,0.3,1)",
                }}
              />
            </div>
            <FieldError state={nomState} field="salarioBase" />
          </div>

          {/* Campos secundarios — solo visibles si hay salario */}
          <div
            style={{
              opacity: createSalarioDigits ? 1 : 0.35,
              pointerEvents: createSalarioDigits ? "auto" : "none",
              transition: "opacity 220ms",
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 12,
            }}
          >
            <div>
              <label style={{ font: "510 11px/1 Inter,sans-serif", color: "#8a8f98", display: "block", marginBottom: 6 }}>Horas extra</label>
              <div style={{ position: "relative" }}>
                <span
                  style={{
                    position: "absolute",
                    left: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#62666d",
                    font: "510 12px/1 Inter,sans-serif",
                    pointerEvents: "none",
                  }}
                >
                  $
                </span>
                <input
                  inputMode="numeric"
                  value={horasFmt}
                  onChange={(e) => setCreateHorasExtraDigits(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="0"
                  style={{
                    width: "100%",
                    height: 34,
                    padding: "0 10px 0 22px",
                    background: "rgba(0,0,0,0.30)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    borderRadius: 8,
                    color: "#f7f8f8",
                    font: "510 13px/1 Inter,sans-serif",
                    outline: "none",
                  }}
                />
              </div>
            </div>
            <div>
              <label style={{ font: "510 11px/1 Inter,sans-serif", color: "#8a8f98", display: "block", marginBottom: 6 }}>Otros ingresos</label>
              <div style={{ position: "relative" }}>
                <span
                  style={{
                    position: "absolute",
                    left: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#62666d",
                    font: "510 12px/1 Inter,sans-serif",
                    pointerEvents: "none",
                  }}
                >
                  $
                </span>
                <input
                  inputMode="numeric"
                  value={otrosFmt}
                  onChange={(e) => setCreateOtrosIngresosDigits(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="0"
                  style={{
                    width: "100%",
                    height: 34,
                    padding: "0 10px 0 22px",
                    background: "rgba(0,0,0,0.30)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    borderRadius: 8,
                    color: "#f7f8f8",
                    font: "510 13px/1 Inter,sans-serif",
                    outline: "none",
                  }}
                />
              </div>
            </div>
            <div>
              <label style={{ font: "510 11px/1 Inter,sans-serif", color: "#8a8f98", display: "block", marginBottom: 6 }}>Otras deducciones</label>
              <div style={{ position: "relative" }}>
                <span
                  style={{
                    position: "absolute",
                    left: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#62666d",
                    font: "510 12px/1 Inter,sans-serif",
                    pointerEvents: "none",
                  }}
                >
                  $
                </span>
                <input
                  inputMode="numeric"
                  value={otrasDedFmt}
                  onChange={(e) => setCreateOtrasDedDigits(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="0"
                  style={{
                    width: "100%",
                    height: 34,
                    padding: "0 10px 0 22px",
                    background: "rgba(0,0,0,0.30)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    borderRadius: 8,
                    color: "#f7f8f8",
                    font: "510 13px/1 Inter,sans-serif",
                    outline: "none",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Notas */}
          <div
            style={{
              opacity: createSalarioDigits ? 1 : 0.35,
              pointerEvents: createSalarioDigits ? "auto" : "none",
              transition: "opacity 220ms",
            }}
          >
            <label style={{ font: "510 11px/1 Inter,sans-serif", color: "#8a8f98", display: "block", marginBottom: 6 }}>Notas</label>
            <textarea
              name="notas"
              value={createNomNotas}
              onChange={(e) => setCreateNomNotas(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Ej: Incluye bono de productividad"
              style={{
                width: "100%",
                padding: "10px 12px",
                background: "rgba(0,0,0,0.30)",
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: 8,
                color: "#f7f8f8",
                font: "510 13px/1 Inter,sans-serif",
                outline: "none",
                resize: "vertical",
                fontFamily: "Inter, sans-serif",
              }}
            />
          </div>

          {/* Preview */}
          {preview && (
            <div
              style={{
                padding: "16px 18px",
                background: "rgba(94,106,210,0.06)",
                border: "1px solid rgba(113,112,255,0.20)",
                borderRadius: 10,
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ font: "590 13px/1.2 Inter,sans-serif", color: "#f7f8f8" }}>Desglose calculado</span>
                <span style={{ font: "400 11px/1 Inter,sans-serif", color: "#62666d" }}>Edita cualquier valor si es necesario</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                {[
                  {
                    label: "Auxilio transporte",
                    value: overrideAuxilio || formatCopFromDigits(String(preview.auxilio)),
                    base: preview.auxilio,
                    set: setOverrideAuxilio,
                    override: overrideAuxilio,
                  },
                  {
                    label: "Salud empleado (4%)",
                    value: overrideDedSalud || formatCopFromDigits(String(preview.dedSalud)),
                    base: preview.dedSalud,
                    set: setOverrideDedSalud,
                    override: overrideDedSalud,
                  },
                  {
                    label: "Pensión empleado (4%)",
                    value: overrideDedPension || formatCopFromDigits(String(preview.dedPension)),
                    base: preview.dedPension,
                    set: setOverrideDedPension,
                    override: overrideDedPension,
                  },
                  {
                    label: "SS empleador",
                    value: overrideSS || formatCopFromDigits(String(preview.ss)),
                    base: preview.ss,
                    set: setOverrideSS,
                    override: overrideSS,
                  },
                  {
                    label: "Parafiscales",
                    value: overridePara || formatCopFromDigits(String(preview.para)),
                    base: preview.para,
                    set: setOverridePara,
                    override: overridePara,
                  },
                  {
                    label: "Prestaciones",
                    value: overrideProv || formatCopFromDigits(String(preview.prov)),
                    base: preview.prov,
                    set: setOverrideProv,
                    override: overrideProv,
                  },
                ].map((f) => (
                  <div key={f.label}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <label style={{ font: "510 10px/1 Inter,sans-serif", color: "#8a8f98", letterSpacing: "0.3px" }}>{f.label}</label>
                      {f.override !== "" && (
                        <button
                          type="button"
                          onClick={() => f.set("")}
                          style={{
                            font: "510 9px/1 Inter,sans-serif",
                            color: "#62666d",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: 0,
                            textDecoration: "underline",
                          }}
                        >
                          Restablecer
                        </button>
                      )}
                    </div>
                    <div style={{ position: "relative" }}>
                      <span
                        style={{
                          position: "absolute",
                          left: 8,
                          top: "50%",
                          transform: "translateY(-50%)",
                          color: "#62666d",
                          font: "510 11px/1 Inter,sans-serif",
                          pointerEvents: "none",
                        }}
                      >
                        $
                      </span>
                      <input
                        inputMode="numeric"
                        value={
                          f.override !== ""
                            ? formatCopFromDigits(f.override)
                            : formatCopN(f.base).replace(/[^\d]/g, "") === "0"
                              ? "0"
                              : formatCopFromDigits(String(f.base))
                        }
                        onChange={(e) => f.set(e.target.value.replace(/[^\d]/g, ""))}
                        onFocus={() => {
                          if (f.override === "") f.set(String(f.base));
                        }}
                        style={{
                          width: "100%",
                          height: 30,
                          padding: "0 8px 0 18px",
                          background: f.override !== "" ? "rgba(113,112,255,0.08)" : "rgba(0,0,0,0.20)",
                          border: "1px solid",
                          borderColor: f.override !== "" ? "rgba(113,112,255,0.30)" : "rgba(255,255,255,0.08)",
                          borderRadius: 7,
                          color: "#f7f8f8",
                          font: "510 12px/1 Inter,sans-serif",
                          outline: "none",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />
              <div style={{ display: "flex", gap: 24 }}>
                <div>
                  <p style={{ font: "510 10px/1 Inter,sans-serif", color: "#8a8f98", letterSpacing: "0.8px", textTransform: "uppercase", margin: 0 }}>Neto empleado</p>
                  <p style={{ font: "590 20px/1.2 Inter,sans-serif", color: "#f7f8f8", margin: "4px 0 0", fontVariantNumeric: "tabular-nums" }}>{formatCopN(preview.neto)}</p>
                </div>
                <div>
                  <p style={{ font: "510 10px/1 Inter,sans-serif", color: "#8a8f98", letterSpacing: "0.8px", textTransform: "uppercase", margin: 0 }}>Costo total empleador</p>
                  <p style={{ font: "590 20px/1.2 Inter,sans-serif", color: "#a4adff", margin: "4px 0 0", fontVariantNumeric: "tabular-nums" }}>{formatCopN(preview.costoTotal)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingTop: 14,
              borderTop: "1px solid rgba(255,255,255,0.05)",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "400 12px/1 Inter,sans-serif", color: "#8a8f98" }}>
              <span style={{ color: createNomEmpleadoId ? "#a4adff" : "#4a4d54" }}>●</span>
              <span style={{ color: createNomPeriodo ? "#a4adff" : "#4a4d54" }}>●</span>
              <span style={{ color: createSalarioDigits ? "#a4adff" : "#4a4d54" }}>●</span>
              <span style={{ marginLeft: 4 }}>
                {!createNomEmpleadoId ? "Selecciona un empleado" : !createSalarioDigits ? "Ingresa el salario base" : "Listo para registrar"}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {addNomState.ok === false && !addNomState.field ? (
                <span style={{ font: "400 12px/1 Inter,sans-serif", color: "#f87171" }}>{addNomState.message}</span>
              ) : null}
              {addNomState.ok && addNomState.message ? (
                <span style={{ font: "400 12px/1 Inter,sans-serif", color: "#a4adff" }}>{addNomState.message}</span>
              ) : null}
              <button
                type="submit"
                disabled={!createNomEmpleadoId || !createSalarioDigits}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  height: 38,
                  padding: "0 18px",
                  background: createNomEmpleadoId && createSalarioDigits ? "linear-gradient(180deg,#6b78de,#5e6ad2)" : "rgba(255,255,255,0.04)",
                  border: "1px solid",
                  borderColor: createNomEmpleadoId && createSalarioDigits ? "rgba(113,112,255,0.5)" : "rgba(255,255,255,0.06)",
                  borderRadius: 10,
                  color: createNomEmpleadoId && createSalarioDigits ? "#fff" : "#62666d",
                  font: "590 13px/1 Inter,sans-serif",
                  cursor: createNomEmpleadoId && createSalarioDigits ? "pointer" : "not-allowed",
                  boxShadow:
                    createNomEmpleadoId && createSalarioDigits ? "inset 0 1px 0 rgba(255,255,255,0.16), 0 4px 14px rgba(94,106,210,0.32)" : "none",
                  transition: "all 150ms cubic-bezier(0.16,1,0.3,1)",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
                Registrar nómina
              </button>
            </div>
          </div>
        </form>
      </section>

      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 80,
          transform: nomDrawerOpen ? "translateY(0)" : "translateY(100%)",
          transition: "transform 300ms cubic-bezier(0.16,1,0.3,1)",
          display: "flex",
          flexDirection: "column",
          maxHeight: "60vh",
          background: "#0c0d0e",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 -24px 60px rgba(0,0,0,0.5)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 20px 12px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ font: "590 15px/1.2 Inter,sans-serif", color: "#f7f8f8", letterSpacing: "-0.2px" }}>Historial de nóminas</span>
            <span style={{ font: "510 11px/1 Inter,sans-serif", color: "#8a8f98", background: "rgba(255,255,255,0.04)", padding: "3px 8px", borderRadius: 999 }}>{nominasInicial.length}</span>
          </div>
          <button
            type="button"
            onClick={() => setNomDrawerOpen(false)}
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#8a8f98",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-label="Cerrar"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {nominasInicial.length === 0 ? (
            <p style={{ padding: "24px 20px", font: "400 13px/1.4 Inter,sans-serif", color: "#62666d" }}>Aún no hay nóminas registradas.</p>
          ) : filtradasNominasPorCol.length === 0 ? (
            <p style={{ padding: "24px 20px", font: "400 13px/1.4 Inter,sans-serif", color: "#62666d" }}>No hay nóminas que coincidan con la búsqueda.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 20px",
                  background: "rgba(255,255,255,0.015)",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                  position: "sticky",
                  top: 0,
                  zIndex: 2,
                  backdropFilter: "blur(8px)",
                }}
              >
                <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", justifyContent: "flex-start", position: "relative" }}>
                  <ColumnHeader
                    label="Empleado"
                    columnKey="empleado"
                    sortColumn={nominasSortColumn}
                    sortDirection={nominasSortDirection}
                    onSort={onSortNominas}
                    searchValue={nominasColumnSearch.empleado ?? ""}
                    onSearch={onSearchNominas}
                    onClear={() => {
                      if (nominasSortColumn === "empleado") {
                        setNominasSortColumn(null);
                        setNominasSortDirection("asc");
                      }
                      onSearchNominas("empleado", "");
                    }}
                  />
                </div>
                <div style={{ flex: "0 0 90px", display: "flex", justifyContent: "flex-start", position: "relative" }}>
                  <ColumnHeader
                    label="Período"
                    columnKey="periodo"
                    sortColumn={nominasSortColumn}
                    sortDirection={nominasSortDirection}
                    onSort={onSortNominas}
                    searchValue={nominasColumnSearch.periodo ?? ""}
                    onSearch={onSearchNominas}
                    onClear={() => {
                      if (nominasSortColumn === "periodo") {
                        setNominasSortColumn(null);
                        setNominasSortDirection("asc");
                      }
                      onSearchNominas("periodo", "");
                    }}
                  />
                </div>
                <div style={{ flex: "0 0 120px", display: "flex", justifyContent: "flex-start", position: "relative" }}>
                  <ColumnHeader
                    label="Salario"
                    columnKey="salarioBase"
                    sortColumn={nominasSortColumn}
                    sortDirection={nominasSortDirection}
                    onSort={onSortNominas}
                    searchValue={nominasColumnSearch.salarioBase ?? ""}
                    onSearch={onSearchNominas}
                    onClear={() => {
                      if (nominasSortColumn === "salarioBase") {
                        setNominasSortColumn(null);
                        setNominasSortDirection("asc");
                      }
                      onSearchNominas("salarioBase", "");
                    }}
                  />
                </div>
                <div style={{ flex: "0 0 110px", display: "flex", justifyContent: "flex-start", position: "relative" }}>
                  <ColumnHeader
                    label="Neto"
                    columnKey="netoEmpleado"
                    sortColumn={nominasSortColumn}
                    sortDirection={nominasSortDirection}
                    onSort={onSortNominas}
                    searchValue={nominasColumnSearch.netoEmpleado ?? ""}
                    onSearch={onSearchNominas}
                    onClear={() => {
                      if (nominasSortColumn === "netoEmpleado") {
                        setNominasSortColumn(null);
                        setNominasSortDirection("asc");
                      }
                      onSearchNominas("netoEmpleado", "");
                    }}
                  />
                </div>
                <div style={{ flex: "0 0 120px", display: "flex", justifyContent: "flex-start", position: "relative" }}>
                  <ColumnHeader
                    label="Costo total"
                    columnKey="costoTotal"
                    sortColumn={nominasSortColumn}
                    sortDirection={nominasSortDirection}
                    onSort={onSortNominas}
                    searchValue={nominasColumnSearch.costoTotal ?? ""}
                    onSearch={onSearchNominas}
                    onClear={() => {
                      if (nominasSortColumn === "costoTotal") {
                        setNominasSortColumn(null);
                        setNominasSortDirection("asc");
                      }
                      onSearchNominas("costoTotal", "");
                    }}
                  />
                </div>
                <div style={{ flex: "0 0 110px", display: "flex", justifyContent: "flex-start", position: "relative" }}>
                  <span style={{ font: "510 11px/1 Inter,sans-serif", color: "#8a8f98", letterSpacing: "0.5px", textTransform: "uppercase" }}>Notas</span>
                </div>
                <div style={{ flex: "0 0 160px", display: "flex", justifyContent: "flex-end", position: "relative" }}>
                  <span style={{ font: "510 11px/1 Inter,sans-serif", color: "#8a8f98", letterSpacing: "0.5px", textTransform: "uppercase" }}>Acciones</span>
                </div>
              </div>

              {nominasAMostrar.map((row) => {
                const isDel = deleteNomId === row.id;
                return (
                  <div
                    key={row.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 20px",
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                      background: isDel ? "rgba(224,82,82,0.06)" : "transparent",
                    }}
                  >
                    <div style={{ flex: "1 1 0" }}>
                      <span style={{ font: "510 13px/1 Inter,sans-serif", color: "#f7f8f8" }}>{row.empleado.nombre}</span>
                    </div>
                    <div style={{ flex: "0 0 90px" }}>
                      <span style={{ font: "400 12px/1 Inter,sans-serif", color: "#d0d6e0", fontVariantNumeric: "tabular-nums" }}>{formatPeriodo(row.periodo)}</span>
                    </div>
                    <div style={{ flex: "0 0 120px" }}>
                      <span style={{ font: "400 12px/1 Inter,sans-serif", color: "#d0d6e0", fontVariantNumeric: "tabular-nums" }}>{formatCopN(Number(row.salarioBase))}</span>
                    </div>
                    <div style={{ flex: "0 0 110px" }}>
                      <span style={{ font: "510 13px/1 Inter,sans-serif", color: "#f7f8f8", fontVariantNumeric: "tabular-nums" }}>{formatCopN(Number(row.netoEmpleado))}</span>
                    </div>
                    <div style={{ flex: "0 0 120px" }}>
                      <span style={{ font: "510 13px/1 Inter,sans-serif", color: "#a4adff", fontVariantNumeric: "tabular-nums" }}>{formatCopN(Number(row.costoTotalEmpleador))}</span>
                    </div>
                    <div style={{ flex: "0 0 110px" }}>
                      <span
                        style={{
                          font: "400 12px/1.3 Inter,sans-serif",
                          color: "#8a8f98",
                          overflow: "hidden",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                        }}
                      >
                        {row.notas?.trim() || "—"}
                      </span>
                    </div>
                    <div style={{ flex: "0 0 160px", display: "flex", justifyContent: "flex-end", gap: 6 }}>
                      {isDel ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setDeleteNomId(null)}
                            style={{
                              height: 28,
                              padding: "0 10px",
                              background: "rgba(255,255,255,0.04)",
                              border: "1px solid rgba(255,255,255,0.06)",
                              borderRadius: 6,
                              color: "#d0d6e0",
                              font: "510 12px/1 Inter,sans-serif",
                              cursor: "pointer",
                            }}
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={() => confirmDeleteNom(row.id)}
                            style={{
                              height: 28,
                              padding: "0 10px",
                              background: "rgba(224,82,82,0.22)",
                              border: "1px solid rgba(224,82,82,0.4)",
                              borderRadius: 6,
                              color: "#ff8585",
                              font: "510 12px/1 Inter,sans-serif",
                              cursor: "pointer",
                            }}
                          >
                            Confirmar
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => beginEditNom(row)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                              height: 28,
                              padding: "0 10px",
                              background: "rgba(255,255,255,0.04)",
                              border: "1px solid rgba(255,255,255,0.06)",
                              borderRadius: 6,
                              color: "#d0d6e0",
                              font: "510 12px/1 Inter,sans-serif",
                              cursor: "pointer",
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteNomId(row.id)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                              height: 28,
                              padding: "0 10px",
                              background: "rgba(224,82,82,0.14)",
                              border: "1px solid rgba(224,82,82,0.30)",
                              borderRadius: 6,
                              color: "#ff8585",
                              font: "510 12px/1 Inter,sans-serif",
                              cursor: "pointer",
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                              <path d="M10 11v6M14 11v6" />
                            </svg>
                            Eliminar
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}

              {nominasOrdenadas.length > nominasVisibleCount ? (
                <button
                  type="button"
                  onClick={() => setNominasVisibleCount((v) => v + 10)}
                  style={{
                    width: "100%",
                    padding: "10px 0",
                    background: "transparent",
                    border: "none",
                    borderTop: "1px solid rgba(255,255,255,0.06)",
                    color: "#8a8f98",
                    font: "510 12px/1 Inter,sans-serif",
                    cursor: "pointer",
                  }}
                >
                  Ver {Math.min(10, nominasOrdenadas.length - nominasVisibleCount)} más
                </button>
              ) : null}

              <p
                style={{
                  padding: "8px 20px 16px",
                  margin: 0,
                  font: "400 11px/1 Inter,sans-serif",
                  color: "#62666d",
                  textAlign: "center",
                }}
              >
                Mostrando {nominasAMostrar.length} de {nominasOrdenadas.length} nóminas
              </p>
            </div>
          )}
        </div>
      </div>

      {typeof window !== "undefined" &&
        editingEmpId &&
        empDraft &&
        createPortal(
          <div style={{ position: "fixed", inset: 0, zIndex: 500 }}>
            <div onClick={cancelEditEmp} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.65)" }} />
            <div
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                bottom: 0,
                width: "min(480px,100vw)",
                background: "#0c0d0e",
                borderLeft: "1px solid rgba(255,255,255,0.08)",
                display: "flex",
                flexDirection: "column",
                boxShadow: "-24px 0 60px rgba(0,0,0,0.6)",
              }}
            >
              <div
                style={{
                  padding: "20px 22px 16px",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 12,
                  flexShrink: 0,
                }}
              >
                <div>
                  <p
                    style={{
                      font: "590 10px/1 Inter,sans-serif",
                      color: "#7170ff",
                      letterSpacing: "1.2px",
                      textTransform: "uppercase",
                      margin: 0,
                    }}
                  >
                    EDITANDO EMPLEADO
                  </p>
                  <h2 style={{ font: "590 20px/1.2 Inter,sans-serif", color: "#f7f8f8", letterSpacing: "-0.3px", margin: "6px 0 0" }}>
                    {empDraft.nombre || "Empleado"}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={cancelEditEmp}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    height: 32,
                    padding: "0 12px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 8,
                    color: "#d0d6e0",
                    font: "510 12px/1 Inter,sans-serif",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                  Cerrar
                </button>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
                <div
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 12,
                    padding: "16px 16px 18px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <span style={{ font: "590 14px/1.2 Inter,sans-serif", color: "#f7f8f8" }}>Nombre</span>
                  <input
                    value={empDraft.nombre}
                    onChange={(e) => setEmpDraft((d) => (d ? { ...d, nombre: e.target.value } : d))}
                    maxLength={100}
                    style={{
                      width: "100%",
                      height: 38,
                      padding: "0 12px",
                      background: "rgba(0,0,0,0.30)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      borderRadius: 8,
                      color: "#f7f8f8",
                      font: "510 14px/1 Inter,sans-serif",
                      outline: "none",
                    }}
                  />
                </div>
                <div
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 12,
                    padding: "16px 16px 18px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  <span style={{ font: "590 14px/1.2 Inter,sans-serif", color: "#f7f8f8" }}>Rol</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {ROL_KEYS.map((k) => {
                      const on = empDraft.rol === k;
                      return (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setEmpDraft((d) => (d ? { ...d, rol: k } : d))}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            height: 32,
                            padding: "0 13px",
                            background: on ? "rgba(113,112,255,0.16)" : "rgba(255,255,255,0.03)",
                            border: "1px solid",
                            borderColor: on ? "rgba(113,112,255,0.45)" : "rgba(255,255,255,0.08)",
                            borderRadius: 999,
                            color: on ? "#fff" : "#d0d6e0",
                            font: "510 13px/1 Inter,sans-serif",
                            cursor: "pointer",
                            transition: "all 150ms cubic-bezier(0.16,1,0.3,1)",
                          }}
                        >
                          {on && (
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                              <path d="M20 6L9 17l-5-5" />
                            </svg>
                          )}
                          {ROL_LABELS[k]}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 12,
                    padding: "16px 16px 18px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  <span style={{ font: "590 14px/1.2 Inter,sans-serif", color: "#f7f8f8" }}>Tipo de contrato</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {TIPO_KEYS.map((k) => {
                      const on = empDraft.tipoContrato === k;
                      return (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setEmpDraft((d) => (d ? { ...d, tipoContrato: k } : d))}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            height: 32,
                            padding: "0 13px",
                            background: on ? "rgba(113,112,255,0.16)" : "rgba(255,255,255,0.03)",
                            border: "1px solid",
                            borderColor: on ? "rgba(113,112,255,0.45)" : "rgba(255,255,255,0.08)",
                            borderRadius: 999,
                            color: on ? "#fff" : "#d0d6e0",
                            font: "510 13px/1 Inter,sans-serif",
                            cursor: "pointer",
                            transition: "all 150ms cubic-bezier(0.16,1,0.3,1)",
                          }}
                        >
                          {on && (
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                              <path d="M20 6L9 17l-5-5" />
                            </svg>
                          )}
                          {TIPO_CONTRATO_LABELS[k]}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {saveEmpError ? (
                  <div style={{ padding: "10px 14px", background: "rgba(224,82,82,0.10)", border: "1px solid rgba(224,82,82,0.25)", borderRadius: 8 }}>
                    <span style={{ font: "510 13px/1.4 Inter,sans-serif", color: "#f87171" }}>{saveEmpError}</span>
                  </div>
                ) : null}
              </div>
              <div style={{ padding: "14px 22px 18px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 8, flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={cancelEditEmp}
                  style={{
                    flex: 1,
                    height: 42,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 10,
                    color: "#d0d6e0",
                    font: "510 13px/1 Inter,sans-serif",
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={saveEmp}
                  disabled={pending}
                  style={{
                    flex: 2,
                    height: 42,
                    background: "linear-gradient(180deg,#6b78de,#5e6ad2)",
                    border: "1px solid rgba(113,112,255,0.5)",
                    borderRadius: 10,
                    color: "#fff",
                    font: "590 13px/1 Inter,sans-serif",
                    cursor: "pointer",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15), 0 4px 14px rgba(94,106,210,0.3)",
                    opacity: pending ? 0.7 : 1,
                  }}
                >
                  {pending ? "Guardando…" : "Guardar cambios"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {typeof window !== "undefined" &&
        editNomId &&
        editNomDraft &&
        createPortal(
          <div style={{ position: "fixed", inset: 0, zIndex: 500 }}>
            <div onClick={cancelEditNom} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.65)" }} />
            <div
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                bottom: 0,
                width: "min(520px,100vw)",
                background: "#0c0d0e",
                borderLeft: "1px solid rgba(255,255,255,0.08)",
                display: "flex",
                flexDirection: "column",
                boxShadow: "-24px 0 60px rgba(0,0,0,0.6)",
              }}
            >
              <div
                style={{
                  padding: "20px 22px 16px",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 12,
                  flexShrink: 0,
                }}
              >
                <div>
                  <p
                    style={{
                      font: "590 10px/1 Inter,sans-serif",
                      color: "#7170ff",
                      letterSpacing: "1.2px",
                      textTransform: "uppercase",
                      margin: 0,
                    }}
                  >
                    EDITANDO NÓMINA
                  </p>
                  <h2 style={{ font: "590 20px/1.2 Inter,sans-serif", color: "#f7f8f8", letterSpacing: "-0.3px", margin: "6px 0 0" }}>
                    {empleadosInicial.find((e) => e.id === editNomDraft.empleadoId)?.nombre ?? "Nómina"}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={cancelEditNom}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    height: 32,
                    padding: "0 12px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 8,
                    color: "#d0d6e0",
                    font: "510 12px/1 Inter,sans-serif",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                  Cerrar
                </button>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
                <div
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 12,
                    padding: "16px 16px 18px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <span style={{ font: "590 14px/1.2 Inter,sans-serif", color: "#f7f8f8" }}>Período</span>
                  <input
                    type="month"
                    value={editNomDraft.periodo}
                    onChange={(e) => setEditNomDraft((d) => (d ? { ...d, periodo: e.target.value } : d))}
                    style={{
                      height: 38,
                      padding: "0 12px",
                      background: "rgba(0,0,0,0.30)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      borderRadius: 8,
                      color: "#f7f8f8",
                      font: "510 14px/1 Inter,sans-serif",
                      outline: "none",
                    }}
                  />
                </div>
                <div
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 12,
                    padding: "16px 16px 18px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  <span style={{ font: "590 14px/1.2 Inter,sans-serif", color: "#f7f8f8" }}>Salarios e ingresos</span>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {(
                      [
                        { label: "Salario base *", key: "salarioBase" },
                        { label: "Horas extra", key: "horasExtra" },
                        { label: "Otros ingresos", key: "otrosIngresos" },
                        { label: "Otras deducciones", key: "otrasDeduciones" },
                      ] as const
                    ).map((f) => (
                      <div key={f.key}>
                        <label style={{ font: "510 11px/1 Inter,sans-serif", color: "#8a8f98", display: "block", marginBottom: 5 }}>{f.label}</label>
                        <div style={{ position: "relative" }}>
                          <span
                            style={{
                              position: "absolute",
                              left: 10,
                              top: "50%",
                              transform: "translateY(-50%)",
                              color: "#62666d",
                              font: "510 12px/1 Inter,sans-serif",
                              pointerEvents: "none",
                            }}
                          >
                            $
                          </span>
                          <input
                            inputMode="numeric"
                            value={formatCopFromDigits(editNomDraft[f.key])}
                            onChange={(e) =>
                              setEditNomDraft((d) => (d ? { ...d, [f.key]: e.target.value.replace(/[^\d]/g, "") } : d))
                            }
                            style={{
                              width: "100%",
                              height: 34,
                              padding: "0 10px 0 22px",
                              background: "rgba(0,0,0,0.30)",
                              border: "1px solid rgba(255,255,255,0.10)",
                              borderRadius: 8,
                              color: "#f7f8f8",
                              font: "510 13px/1 Inter,sans-serif",
                              outline: "none",
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 12,
                    padding: "16px 16px 18px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <span style={{ font: "590 14px/1.2 Inter,sans-serif", color: "#f7f8f8" }}>Notas</span>
                  <textarea
                    value={editNomDraft.notas}
                    onChange={(e) => setEditNomDraft((d) => (d ? { ...d, notas: e.target.value } : d))}
                    rows={2}
                    maxLength={500}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      background: "rgba(0,0,0,0.30)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      borderRadius: 8,
                      color: "#f7f8f8",
                      font: "510 13px/1 Inter,sans-serif",
                      outline: "none",
                      resize: "vertical",
                      fontFamily: "Inter,sans-serif",
                    }}
                  />
                </div>
                {editNomPreview ? (
                  <div
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 12,
                      padding: "16px 16px 18px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ font: "590 14px/1.2 Inter,sans-serif", color: "#f7f8f8" }}>Desglose</span>
                      <span style={{ font: "400 11px/1 Inter,sans-serif", color: "#62666d" }}>Edita si es necesario</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      {(
                        [
                          { key: "auxilio", label: "Auxilio transporte", base: editNomPreview.auxilio },
                          { key: "dedSalud", label: "Salud empleado (4%)", base: editNomPreview.dedSalud },
                          { key: "dedPension", label: "Pensión empleado (4%)", base: editNomPreview.dedPension },
                          { key: "ss", label: "SS empleador", base: editNomPreview.ss },
                          { key: "para", label: "Parafiscales", base: editNomPreview.para },
                          { key: "prov", label: "Prestaciones", base: editNomPreview.prov },
                        ] as const
                      ).map((f) => (
                        <div key={f.key}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                            <label style={{ font: "510 10px/1 Inter,sans-serif", color: "#8a8f98" }}>{f.label}</label>
                            {editOverrides[f.key] !== undefined && (
                              <button
                                type="button"
                                onClick={() =>
                                  setEditOverrides((o) => {
                                    const n = { ...o };
                                    delete n[f.key];
                                    return n;
                                  })
                                }
                                style={{
                                  font: "510 9px/1 Inter,sans-serif",
                                  color: "#62666d",
                                  background: "none",
                                  border: "none",
                                  cursor: "pointer",
                                  padding: 0,
                                  textDecoration: "underline",
                                }}
                              >
                                Restablecer
                              </button>
                            )}
                          </div>
                          <div style={{ position: "relative" }}>
                            <span
                              style={{
                                position: "absolute",
                                left: 8,
                                top: "50%",
                                transform: "translateY(-50%)",
                                color: "#62666d",
                                font: "510 11px/1 Inter,sans-serif",
                                pointerEvents: "none",
                              }}
                            >
                              $
                            </span>
                            <input
                              inputMode="numeric"
                              value={
                                editOverrides[f.key] !== undefined
                                  ? formatCopFromDigits(editOverrides[f.key])
                                  : formatCopFromDigits(String(f.base))
                              }
                              onChange={(e) =>
                                setEditOverrides((o) => ({ ...o, [f.key]: e.target.value.replace(/[^\d]/g, "") }))
                              }
                              style={{
                                width: "100%",
                                height: 30,
                                padding: "0 8px 0 18px",
                                background: editOverrides[f.key] !== undefined ? "rgba(113,112,255,0.08)" : "rgba(0,0,0,0.20)",
                                border: "1px solid",
                                borderColor: editOverrides[f.key] !== undefined ? "rgba(113,112,255,0.30)" : "rgba(255,255,255,0.08)",
                                borderRadius: 7,
                                color: "#f7f8f8",
                                font: "510 12px/1 Inter,sans-serif",
                                outline: "none",
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />
                    <div style={{ display: "flex", gap: 24 }}>
                      <div>
                        <p style={{ font: "510 10px/1 Inter,sans-serif", color: "#8a8f98", letterSpacing: "0.8px", textTransform: "uppercase", margin: 0 }}>Neto empleado</p>
                        <p style={{ font: "590 18px/1.2 Inter,sans-serif", color: "#f7f8f8", margin: "4px 0 0", fontVariantNumeric: "tabular-nums" }}>{formatCopN(editNomPreview.neto)}</p>
                      </div>
                      <div>
                        <p style={{ font: "510 10px/1 Inter,sans-serif", color: "#8a8f98", letterSpacing: "0.8px", textTransform: "uppercase", margin: 0 }}>Costo total</p>
                        <p style={{ font: "590 18px/1.2 Inter,sans-serif", color: "#a4adff", margin: "4px 0 0", fontVariantNumeric: "tabular-nums" }}>{formatCopN(editNomPreview.costoTotal)}</p>
                      </div>
                    </div>
                  </div>
                ) : null}
                {editNomError ? (
                  <div style={{ padding: "10px 14px", background: "rgba(224,82,82,0.10)", border: "1px solid rgba(224,82,82,0.25)", borderRadius: 8 }}>
                    <span style={{ font: "510 13px/1.4 Inter,sans-serif", color: "#f87171" }}>{editNomError}</span>
                  </div>
                ) : null}
              </div>
              <div style={{ padding: "14px 22px 18px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 8, flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={cancelEditNom}
                  style={{
                    flex: 1,
                    height: 42,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 10,
                    color: "#d0d6e0",
                    font: "510 13px/1 Inter,sans-serif",
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => saveEditNom(editNomId!)}
                  disabled={editNomPending}
                  style={{
                    flex: 2,
                    height: 42,
                    background: "linear-gradient(180deg,#6b78de,#5e6ad2)",
                    border: "1px solid rgba(113,112,255,0.5)",
                    borderRadius: 10,
                    color: "#fff",
                    font: "590 13px/1 Inter,sans-serif",
                    cursor: "pointer",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15), 0 4px 14px rgba(94,106,210,0.3)",
                    opacity: editNomPending ? 0.7 : 1,
                  }}
                >
                  {editNomPending ? "Guardando…" : "Guardar cambios"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );

}
