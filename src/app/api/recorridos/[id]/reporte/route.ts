import { asc, eq } from "drizzle-orm";
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

import { db, schema } from "@/db/client";
import { jsonError } from "@/lib/api/json";
import { requirePrincipal } from "@/lib/auth/principal";

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "-";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

function formatMeters(m: number | null | undefined): string {
  if (m == null) return "-";
  if (m >= 1000) return `${(m / 1000).toFixed(2)} km`;
  return `${m.toFixed(0)} m`;
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  let principal;
  try {
    principal = await requirePrincipal(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const { id } = await ctx.params;

  const recorridoRows = await db
    .select({
      id: schema.recorridos.id,
      operarioId: schema.recorridos.operarioId,
      rutaId: schema.recorridos.rutaId,
      iniciadoAt: schema.recorridos.iniciadoAt,
      finalizadoAt: schema.recorridos.finalizadoAt,
      distanciaTotalM: schema.recorridos.distanciaTotalM,
      duracionSegundos: schema.recorridos.duracionSegundos,
      subidoAt: schema.recorridos.subidoAt,
      operarioUsername: schema.users.username,
      operarioFullName: schema.users.fullName,
    })
    .from(schema.recorridos)
    .innerJoin(schema.users, eq(schema.users.id, schema.recorridos.operarioId))
    .where(eq(schema.recorridos.id, id))
    .limit(1);

  const recorrido = recorridoRows[0];
  if (!recorrido) return jsonError("not_found", 404);

  if (principal.role === "operario" && recorrido.operarioId !== principal.userId) {
    return jsonError("forbidden", 403);
  }

  const puntos = await db
    .select({
      timestamp: schema.recorridoPuntos.timestamp,
      latitude: schema.recorridoPuntos.latitude,
      longitude: schema.recorridoPuntos.longitude,
      velocidadMs: schema.recorridoPuntos.velocidadMs,
      precisionM: schema.recorridoPuntos.precisionM,
      bateriaPct: schema.recorridoPuntos.bateriaPct,
    })
    .from(schema.recorridoPuntos)
    .where(eq(schema.recorridoPuntos.recorridoId, id))
    .orderBy(asc(schema.recorridoPuntos.timestamp));

  // Tabla de visitas si hubo ruta asociada
  let visitadosRows: Paragraph[] = [];
  let rutaInfo: { nombre: string; tipo: string; total: number; visitados: number } | null = null;
  if (recorrido.rutaId) {
    const rutaRows = await db
      .select()
      .from(schema.rutas)
      .where(eq(schema.rutas.id, recorrido.rutaId))
      .limit(1);
    const ruta = rutaRows[0];
    if (ruta) {
      const items = await db
        .select()
        .from(schema.rutaItems)
        .where(eq(schema.rutaItems.rutaId, recorrido.rutaId))
        .orderBy(asc(schema.rutaItems.orden));

      const visitados = items.filter((i) => i.visitado).length;
      rutaInfo = {
        nombre: ruta.nombre,
        tipo: ruta.tipo,
        total: items.length,
        visitados,
      };

      for (const it of items) {
        visitadosRows.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `• ${it.codigo}`,
                bold: true,
                size: 22,
              }),
              new TextRun({
                text: it.visitado
                  ? `  [VISITADO ${it.visitadoAt ? formatDateTime(it.visitadoAt) : ""}]`
                  : "  [PENDIENTE]",
                color: it.visitado ? "198754" : "6C757D",
                size: 22,
              }),
            ],
          }),
        );
      }
    }
  }

  // Primeros y ultimos puntos para referencia
  const primerPunto = puntos[0];
  const ultimoPunto = puntos[puntos.length - 1];

  const headerRow = (cells: string[]) =>
    new TableRow({
      children: cells.map(
        (c) =>
          new TableCell({
            shading: { fill: "1F4E79" },
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: c, bold: true, color: "FFFFFF", size: 20 }),
                ],
              }),
            ],
          }),
      ),
    });
  const dataRow = (cells: string[]) =>
    new TableRow({
      children: cells.map(
        (c) =>
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: c, size: 18 })],
              }),
            ],
          }),
      ),
    });

  const infoTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      headerRow(["Campo", "Valor"]),
      dataRow(["Operario", `${recorrido.operarioFullName} (${recorrido.operarioUsername})`]),
      dataRow(["Iniciado", formatDateTime(recorrido.iniciadoAt)]),
      dataRow(["Finalizado", formatDateTime(recorrido.finalizadoAt)]),
      dataRow(["Duracion", formatDuration(recorrido.duracionSegundos)]),
      dataRow(["Distancia total", formatMeters(recorrido.distanciaTotalM)]),
      dataRow(["Puntos GPS registrados", `${puntos.length}`]),
      dataRow([
        "Inicio (GPS)",
        primerPunto
          ? `${primerPunto.latitude.toFixed(6)}, ${primerPunto.longitude.toFixed(6)}`
          : "-",
      ]),
      dataRow([
        "Fin (GPS)",
        ultimoPunto
          ? `${ultimoPunto.latitude.toFixed(6)}, ${ultimoPunto.longitude.toFixed(6)}`
          : "-",
      ]),
      dataRow(["Subido al servidor", formatDateTime(recorrido.subidoAt)]),
    ],
  });

  const children: (Paragraph | Table)[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: "Reporte de Recorrido", bold: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: "Federacion Nacional de Cafeteros - Quindio",
          italics: true,
        }),
      ],
    }),
    new Paragraph({ text: "" }),
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: "Resumen del recorrido", bold: true })],
    }),
    infoTable,
    new Paragraph({ text: "" }),
  ];

  if (rutaInfo) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: "Ruta asociada", bold: true })],
      }),
      new Paragraph({
        children: [
          new TextRun({ text: `Nombre: ${rutaInfo.nombre}`, size: 22 }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({ text: `Tipo: ${rutaInfo.tipo}`, size: 22 }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `Puntos visitados: ${rutaInfo.visitados} de ${rutaInfo.total}`,
            size: 22,
            bold: true,
          }),
        ],
      }),
      new Paragraph({ text: "" }),
      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: [new TextRun({ text: "Detalle de puntos", bold: true })],
      }),
      ...visitadosRows,
    );
  }

  children.push(
    new Paragraph({ text: "" }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [
        new TextRun({
          text: `Generado el ${formatDateTime(new Date().toISOString())}`,
          italics: true,
          size: 18,
          color: "6C757D",
        }),
      ],
    }),
  );

  const doc = new Document({
    creator: "Fedecafe Platform",
    title: `Reporte Recorrido ${recorrido.id}`,
    sections: [{ children }],
  });

  const buffer = await Packer.toBuffer(doc);
  const filename = `recorrido_${recorrido.operarioUsername}_${recorrido.iniciadoAt.slice(0, 10)}.docx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
