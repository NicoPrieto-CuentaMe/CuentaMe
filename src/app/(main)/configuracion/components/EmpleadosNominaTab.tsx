"use client";

import type { Empleado, Nomina, RolEmpleado, TipoContrato } from "@prisma/client";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useFormState } from "react-dom";
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

const btnSecondary =
  "rounded-lg border border-border bg-transparent px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-surface-elevated min-h-[44px] sm:min-h-0";
const btnDanger =
  "rounded-lg border border-danger bg-danger-light px-3 py-1.5 text-sm font-medium text-danger hover:opacity-90 min-h-[44px] sm:min-h-0";
const inlineField =
  "w-full min-h-[44px] rounded border border-border bg-surface-elevated px-2 py-2 text-sm text-text-primary outline-none focus:border-accent";

const loadMoreNominasClass =
  "w-full border border-border border-t-0 bg-surface-elevated/50 py-2 text-center text-xs text-text-tertiary transition hover:bg-surface-elevated";

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
  const [updNomState, updNomAction] = useFormState(updateNomina, initialState);

  const [editingEmpId, setEditingEmpId] = useState<string | null>(null);
  const [empDraft, setEmpDraft] = useState<{
    nombre: string;
    rol: RolEmpleado;
    tipoContrato: TipoContrato;
  } | null>(null);
  const [deleteEmpId, setDeleteEmpId] = useState<string | null>(null);
  const [saveEmpError, setSaveEmpError] = useState<string | null>(null);
  const [deleteEmpError, setDeleteEmpError] = useState<string | null>(null);

  const [editingNominaId, setEditingNominaId] = useState<string | null>(null);
  const [nomEmpleadoId, setNomEmpleadoId] = useState("");
  const [nomPeriodo, setNomPeriodo] = useState(todayMonthLocal);
  const [salarioDigits, setSalarioDigits] = useState("");
  const [horasExtraDigits, setHorasExtraDigits] = useState("");
  const [otrosIngresosDigits, setOtrosIngresosDigits] = useState("");
  const [otrasDedDigits, setOtrasDedDigits] = useState("");
  const [nomNotas, setNomNotas] = useState("");
  const [deleteNomId, setDeleteNomId] = useState<string | null>(null);
  const [nominasVisibleCount, setNominasVisibleCount] = useState(10);
  const [nominasSortColumn, setNominasSortColumn] = useState<string | null>(null);
  const [nominasSortDirection, setNominasSortDirection] = useState<"asc" | "desc">("asc");
  const [nominasColumnSearch, setNominasColumnSearch] = useState<Record<string, string>>({});

  const nomState = editingNominaId ? updNomState : addNomState;
  const nomFormAction = editingNominaId ? updNomAction : addNomAction;

  const preview = useMemo(() => {
    const salario = Number(digitsToSalePriceString(salarioDigits)) || 0;
    const hx = Number(digitsToSalePriceString(horasExtraDigits)) || 0;
    const oi = Number(digitsToSalePriceString(otrosIngresosDigits)) || 0;
    const od = Number(digitsToSalePriceString(otrasDedDigits)) || 0;
    if (salario <= 0) return null;
    return calcularNomina({
      salarioBase: salario,
      horasExtra: hx,
      otrosIngresos: oi,
      otrasDeduciones: od,
    });
  }, [salarioDigits, horasExtraDigits, otrosIngresosDigits, otrasDedDigits]);

  const salarioHidden = digitsToSalePriceString(salarioDigits);
  const horasHidden = digitsToSalePriceString(horasExtraDigits);
  const otrosHidden = digitsToSalePriceString(otrosIngresosDigits);
  const otrasDedHidden = digitsToSalePriceString(otrasDedDigits);

  const salarioFmt = formatCopFromDigits(salarioDigits);
  const horasFmt = formatCopFromDigits(horasExtraDigits);
  const otrosFmt = formatCopFromDigits(otrosIngresosDigits);
  const otrasDedFmt = formatCopFromDigits(otrasDedDigits);

  useEffect(() => {
    if (!addEmpState.ok || !addEmpState.message) return;
    setAddEmpKey((k) => k + 1);
    router.refresh();
  }, [addEmpState, router]);

  useEffect(() => {
    if (!nomState.ok || !nomState.message) return;
    setEditingNominaId(null);
    setNomEmpleadoId("");
    setNomPeriodo(todayMonthLocal());
    setSalarioDigits("");
    setHorasExtraDigits("");
    setOtrosIngresosDigits("");
    setOtrasDedDigits("");
    setNomNotas("");
    router.refresh();
  }, [nomState, router]);

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

  const loadNominaEdit = useCallback((row: NominaConEmpleado) => {
    setEditingNominaId(row.id);
    setNomEmpleadoId(row.empleadoId);
    setNomPeriodo(dateToMonthInput(row.periodo));
    setSalarioDigits(precioVentaToDigits(row.salarioBase));
    setHorasExtraDigits(precioVentaToDigits(row.horasExtra));
    setOtrosIngresosDigits(precioVentaToDigits(row.otrosIngresos));
    setOtrasDedDigits(precioVentaToDigits(row.otrasDeduciones));
    setNomNotas(row.notas ?? "");
    setDeleteNomId(null);
  }, []);

  const cancelNomEdit = useCallback(() => {
    setEditingNominaId(null);
    setNomEmpleadoId("");
    setNomPeriodo(todayMonthLocal());
    setSalarioDigits("");
    setHorasExtraDigits("");
    setOtrosIngresosDigits("");
    setOtrasDedDigits("");
    setNomNotas("");
  }, []);

  const confirmDeleteNom = useCallback(
    (id: string) => {
      const fd = new FormData();
      fd.set("id", id);
      startTransition(async () => {
        const res = await deleteNomina(idle, fd);
        if (res.ok) {
          setDeleteNomId(null);
          if (editingNominaId === id) cancelNomEdit();
          router.refresh();
        }
      });
    },
    [router, editingNominaId, cancelNomEdit],
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
    <div className="space-y-8">
      <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h3 className="text-base font-semibold text-text-primary">Empleados</h3>
        <p className="mt-1 text-sm text-text-tertiary">Registra el personal de tu restaurante.</p>

        <form key={addEmpKey} action={addEmpAction} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <label className="text-sm font-medium text-text-secondary" htmlFor="emp-nombre-new">
                Nombre *
              </label>
              <input
                id="emp-nombre-new"
                name="nombre"
                type="text"
                maxLength={100}
                className={`mt-1 ${inlineField}`}
                placeholder="Nombre completo"
                required
              />
              <FieldError state={addEmpState} field="nombre" />
            </div>
            <div>
              <label className="text-sm font-medium text-text-secondary" htmlFor="emp-rol-new">
                Rol *
              </label>
              <select id="emp-rol-new" name="rol" required className={`mt-1 ${inlineField}`}>
                {ROL_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {ROL_LABELS[k]}
                  </option>
                ))}
              </select>
              <FieldError state={addEmpState} field="rol" />
            </div>
            <div>
              <label className="text-sm font-medium text-text-secondary" htmlFor="emp-tipo-new">
                Tipo de contrato *
              </label>
              <select id="emp-tipo-new" name="tipoContrato" required className={`mt-1 ${inlineField}`}>
                {TIPO_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {TIPO_CONTRATO_LABELS[k]}
                  </option>
                ))}
              </select>
              <FieldError state={addEmpState} field="tipoContrato" />
            </div>
          </div>
          <button
            type="submit"
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover min-h-[44px] w-full sm:w-auto"
          >
            Agregar
          </button>
          {addEmpState.ok && addEmpState.message ? (
            <p className="text-sm text-accent">{addEmpState.message}</p>
          ) : null}
          {addEmpState.ok === false && !addEmpState.field ? (
            <p className="text-sm text-danger">{addEmpState.message}</p>
          ) : null}
        </form>

        <div className="mt-6 overflow-x-auto">
          {empleadosInicial.length === 0 ? (
            <p className="text-sm text-text-tertiary">Aún no has registrado empleados.</p>
          ) : (
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-elevated/80">
                  <th className="px-3 py-2 font-medium text-text-secondary">Nombre</th>
                  <th className="px-3 py-2 font-medium text-text-secondary">Rol</th>
                  <th className="px-3 py-2 font-medium text-text-secondary">Tipo contrato</th>
                  <th className="px-3 py-2 font-medium text-text-secondary">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {empleadosInicial.map((row) => {
                  const isEditing = editingEmpId === row.id && empDraft;
                  const isDeleting = deleteEmpId === row.id;
                  return (
                    <tr key={row.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">
                        {isEditing ? (
                          <input
                            type="text"
                            value={empDraft!.nombre}
                            onChange={(e) => setEmpDraft((d) => (d ? { ...d, nombre: e.target.value } : d))}
                            maxLength={100}
                            className={inlineField}
                          />
                        ) : (
                          <span className="text-text-primary">{row.nombre}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {isEditing ? (
                          <select
                            value={empDraft!.rol}
                            onChange={(e) =>
                              setEmpDraft((d) =>
                                d ? { ...d, rol: e.target.value as RolEmpleado } : d,
                              )
                            }
                            className={inlineField}
                          >
                            {ROL_KEYS.map((k) => (
                              <option key={k} value={k}>
                                {ROL_LABELS[k]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-text-secondary">{ROL_LABELS[row.rol]}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {isEditing ? (
                          <select
                            value={empDraft!.tipoContrato}
                            onChange={(e) =>
                              setEmpDraft((d) =>
                                d ? { ...d, tipoContrato: e.target.value as TipoContrato } : d,
                              )
                            }
                            className={inlineField}
                          >
                            {TIPO_KEYS.map((k) => (
                              <option key={k} value={k}>
                                {TIPO_CONTRATO_LABELS[k]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-text-secondary">{TIPO_CONTRATO_LABELS[row.tipoContrato]}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {isDeleting ? (
                          <div className="space-y-2 rounded-lg border border-danger/30 bg-danger-light/30 p-2">
                            <p className="text-xs text-danger">¿Eliminar este empleado?</p>
                            {deleteEmpError ? <p className="text-xs text-danger">{deleteEmpError}</p> : null}
                            <div className="flex flex-wrap gap-2">
                              <button type="button" onClick={() => confirmDeleteEmp(row.id)} className={btnDanger}>
                                Confirmar
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDeleteEmpId(null);
                                  setDeleteEmpError(null);
                                }}
                                className={btnSecondary}
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : isEditing ? (
                          <div>
                            <div className="flex flex-wrap gap-2">
                              <button type="button" onClick={saveEmp} disabled={pending} className={btnSecondary}>
                                Guardar
                              </button>
                              <button type="button" onClick={cancelEditEmp} className={btnSecondary}>
                                Cancelar
                              </button>
                            </div>
                            {saveEmpError && editingEmpId === row.id ? (
                              <p className="mt-1 text-xs text-danger">{saveEmpError}</p>
                            ) : null}
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => beginEditEmp(row)} className={btnSecondary}>
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteEmpError(null);
                                setDeleteEmpId(row.id);
                                cancelEditEmp();
                              }}
                              className={btnDanger}
                            >
                              Eliminar
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h3 className="text-base font-semibold text-text-primary">Nómina</h3>
        <p className="mt-1 text-sm text-text-tertiary">
          Registra liquidaciones por período. Los valores legales se calculan en el servidor al guardar.
        </p>

        <form action={nomFormAction} className="mt-4 space-y-4">
          {editingNominaId ? <input type="hidden" name="id" value={editingNominaId} /> : null}
          <input type="hidden" name="salarioBase" value={salarioHidden} />
          <input type="hidden" name="horasExtra" value={horasHidden} />
          <input type="hidden" name="otrosIngresos" value={otrosHidden} />
          <input type="hidden" name="otrasDeduciones" value={otrasDedHidden} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-text-secondary" htmlFor="nom-emp">
                Empleado *
              </label>
              <select
                id="nom-emp"
                name="empleadoId"
                value={nomEmpleadoId}
                onChange={(e) => setNomEmpleadoId(e.target.value)}
                required
                className={`mt-1 ${inlineField}`}
              >
                <option value="" disabled>
                  Selecciona…
                </option>
                {empleadosInicial.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                  </option>
                ))}
              </select>
              <FieldError state={nomState} field="empleadoId" />
            </div>
            <div>
              <label className="text-sm font-medium text-text-secondary" htmlFor="nom-periodo">
                Período *
              </label>
              <input
                id="nom-periodo"
                name="periodo"
                type="month"
                value={nomPeriodo}
                onChange={(e) => setNomPeriodo(e.target.value)}
                required
                className={`mt-1 ${inlineField}`}
              />
              <FieldError state={nomState} field="periodo" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-text-secondary" htmlFor="nom-salario">
                Salario base *
              </label>
              <div className="relative mt-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-tertiary">
                  $
                </span>
                <input
                  id="nom-salario"
                  inputMode="numeric"
                  type="text"
                  value={salarioFmt}
                  onChange={(e) => setSalarioDigits(e.target.value.replace(/[^\d]/g, ""))}
                  className="w-full min-h-[44px] rounded-lg border border-border bg-surface-elevated py-2 pl-8 pr-3 text-sm text-text-primary outline-none focus:border-accent"
                  placeholder="0"
                  required
                />
              </div>
              <FieldError state={nomState} field="salarioBase" />
            </div>
            <div>
              <label className="text-sm font-medium text-text-secondary" htmlFor="nom-horas">
                Horas extra
              </label>
              <div className="relative mt-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-tertiary">
                  $
                </span>
                <input
                  id="nom-horas"
                  inputMode="numeric"
                  type="text"
                  value={horasFmt}
                  onChange={(e) => setHorasExtraDigits(e.target.value.replace(/[^\d]/g, ""))}
                  className="w-full min-h-[44px] rounded-lg border border-border bg-surface-elevated py-2 pl-8 pr-3 text-sm text-text-primary outline-none focus:border-accent"
                  placeholder="0"
                />
              </div>
              <FieldError state={nomState} field="horasExtra" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-text-secondary" htmlFor="nom-otros">
                Otros ingresos
              </label>
              <div className="relative mt-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-tertiary">
                  $
                </span>
                <input
                  id="nom-otros"
                  inputMode="numeric"
                  type="text"
                  value={otrosFmt}
                  onChange={(e) => setOtrosIngresosDigits(e.target.value.replace(/[^\d]/g, ""))}
                  className="w-full min-h-[44px] rounded-lg border border-border bg-surface-elevated py-2 pl-8 pr-3 text-sm text-text-primary outline-none focus:border-accent"
                  placeholder="0"
                />
              </div>
              <FieldError state={nomState} field="otrosIngresos" />
            </div>
            <div>
              <label className="text-sm font-medium text-text-secondary" htmlFor="nom-otras">
                Otras deducciones
              </label>
              <div className="relative mt-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-tertiary">
                  $
                </span>
                <input
                  id="nom-otras"
                  inputMode="numeric"
                  type="text"
                  value={otrasDedFmt}
                  onChange={(e) => setOtrasDedDigits(e.target.value.replace(/[^\d]/g, ""))}
                  className="w-full min-h-[44px] rounded-lg border border-border bg-surface-elevated py-2 pl-8 pr-3 text-sm text-text-primary outline-none focus:border-accent"
                  placeholder="0"
                />
              </div>
              <FieldError state={nomState} field="otrasDeduciones" />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-text-secondary" htmlFor="nom-notas">
              Notas
            </label>
            <textarea
              id="nom-notas"
              name="notas"
              value={nomNotas}
              onChange={(e) => setNomNotas(e.target.value)}
              rows={3}
              maxLength={500}
              className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent min-h-[44px]"
              placeholder="Ej: Arriendo local principal, pago anticipado, etc."
            />
            <FieldError state={nomState} field="notas" />
          </div>

          {preview ? (
            <div className="rounded-lg border border-border bg-surface-elevated/50 p-4 text-sm">
              <p className="font-medium text-text-primary">
                Neto empleado: {formatCopN(preview.neto)} | Costo total empleador:{" "}
                {formatCopN(preview.costoTotal)}
              </p>
              <p className="mt-2 text-xs text-text-tertiary">
                Salud empleado: {formatCopN(preview.dedSalud)} · Pensión empleado:{" "}
                {formatCopN(preview.dedPension)} · Aportes SS: {formatCopN(preview.ss)} · Parafiscales:{" "}
                {formatCopN(preview.para)} · Prestaciones: {formatCopN(preview.prov)} · Auxilio transporte:{" "}
                {formatCopN(preview.auxilio)}
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover min-h-[44px]"
            >
              {editingNominaId ? "Actualizar nómina" : "Registrar nómina"}
            </button>
            {editingNominaId ? (
              <button type="button" onClick={cancelNomEdit} className={btnSecondary}>
                Cancelar edición
              </button>
            ) : null}
          </div>
          {nomState.ok && nomState.message ? (
            <p className="text-sm text-accent">{nomState.message}</p>
          ) : null}
          {nomState.ok === false && !nomState.field ? (
            <p className="text-sm text-danger">{nomState.message}</p>
          ) : null}
        </form>

        <div className="mt-8 overflow-x-auto">
          <h4 className="mb-3 text-sm font-semibold text-text-primary">Historial de nóminas</h4>
          {nominasInicial.length === 0 ? (
            <p className="text-sm text-text-tertiary">Aún no hay nóminas registradas.</p>
          ) : filtradasNominasPorCol.length === 0 ? (
            <p className="text-sm text-text-tertiary">No hay nóminas que coincidan con la búsqueda de columnas.</p>
          ) : (
            <div className="space-y-2">
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[800px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-elevated/80">
                      <th className="relative px-3 py-2 font-medium text-text-secondary">
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
                      </th>
                      <th className="relative px-3 py-2 font-medium text-text-secondary">
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
                      </th>
                      <th className="relative px-3 py-2 font-medium text-text-secondary">
                        <ColumnHeader
                          label="Salario base"
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
                      </th>
                      <th className="relative px-3 py-2 font-medium text-text-secondary">
                        <ColumnHeader
                          label="Neto empleado"
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
                      </th>
                      <th className="relative px-3 py-2 font-medium text-text-secondary">
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
                      </th>
                      <th className="px-3 py-2 font-medium text-text-secondary">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nominasAMostrar.map((row) => {
                      const isDel = deleteNomId === row.id;
                      return (
                        <tr key={row.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-2 text-text-primary">{row.empleado.nombre}</td>
                          <td className="px-3 py-2 text-text-secondary">{formatPeriodo(row.periodo)}</td>
                          <td className="px-3 py-2 tabular-nums text-text-primary">
                            {formatCopN(Number(row.salarioBase))}
                          </td>
                          <td className="px-3 py-2 tabular-nums text-text-primary">
                            {formatCopN(Number(row.netoEmpleado))}
                          </td>
                          <td className="px-3 py-2 tabular-nums text-text-primary">
                            {formatCopN(Number(row.costoTotalEmpleador))}
                          </td>
                          <td className="px-3 py-2 align-top">
                            {isDel ? (
                              <div className="space-y-2 rounded-lg border border-danger/30 bg-danger-light/30 p-2">
                                <p className="text-xs text-danger">¿Eliminar esta nómina?</p>
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => confirmDeleteNom(row.id)}
                                    className={btnDanger}
                                  >
                                    Confirmar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeleteNomId(null)}
                                    className={btnSecondary}
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => loadNominaEdit(row)}
                                  className={btnSecondary}
                                >
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteNomId(row.id)}
                                  className={btnDanger}
                                >
                                  Eliminar
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {nominasOrdenadas.length > nominasVisibleCount ? (
                  <button
                    type="button"
                    onClick={() => setNominasVisibleCount((v) => v + 10)}
                    className={loadMoreNominasClass}
                  >
                    Ver {Math.min(10, nominasOrdenadas.length - nominasVisibleCount)} más
                  </button>
                ) : null}
              </div>
              <p className="text-center text-xs text-text-tertiary">
                Mostrando {nominasAMostrar.length} de {nominasOrdenadas.length} nóminas
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
