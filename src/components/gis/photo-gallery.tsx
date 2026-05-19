"use client";

import { useEffect, useRef, useState } from "react";

import { useDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

type Photo = {
  id: string;
  url: string | null;
  caption: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  uploadedAt: string;
  uploadedBy: string | null;
};

type Props = {
  targetType: "medidor" | "estructura" | "tuberia";
  targetId: string;
  /// El admin puede subir/eliminar; los operarios solo ver.
  canEdit?: boolean;
};

export function PhotoGallery({ targetType, targetId, canEdit = true }: Props) {
  const dialog = useDialog();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<Photo | null>(null);

  async function refresh() {
    setLoading(true);
    const res = await fetch(
      `/api/entity-photos?targetType=${targetType}&targetId=${encodeURIComponent(targetId)}`,
      { cache: "no-store" },
    );
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const data = await res.json();
    setPhotos(data.photos ?? []);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetType, targetId]);

  async function onFilePicked(file: File) {
    setUploading(true);
    try {
      // 1. presign
      const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
      const presignRes = await fetch("/api/entity-photos/presign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetType,
          targetId,
          contentType: file.type || "image/jpeg",
          ext,
          sizeBytes: file.size,
        }),
      });
      if (!presignRes.ok) {
        toast.error("No se pudo iniciar la carga");
        return;
      }
      const { photoId, storageKey, uploadUrl } = await presignRes.json();

      // 2. subir a R2
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "content-type": file.type || "image/jpeg" },
        body: file,
      });
      if (!putRes.ok) {
        toast.error(`R2 rechazó la subida (HTTP ${putRes.status})`);
        return;
      }

      // 3. confirmar registro
      const confirmRes = await fetch("/api/entity-photos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          photoId,
          targetType,
          targetId,
          storageKey,
          contentType: file.type || "image/jpeg",
          sizeBytes: file.size,
        }),
      });
      if (!confirmRes.ok) {
        toast.error("No se pudo registrar la foto");
        return;
      }
      toast.success("Foto subida");
      await refresh();
    } catch (e) {
      toast.error("Error: " + (e instanceof Error ? e.message : "desconocido"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function deletePhoto(p: Photo) {
    const ok = await dialog.confirm({
      title: "Eliminar foto",
      message: "Esta foto se borrará tanto del catálogo como del storage. ¿Continuar?",
      danger: true,
      confirmLabel: "Eliminar",
    });
    if (!ok) return;
    const res = await fetch(`/api/entity-photos/${p.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("No se pudo eliminar");
      return;
    }
    toast.success("Foto eliminada");
    setPhotos((prev) => prev.filter((x) => x.id !== p.id));
    if (preview?.id === p.id) setPreview(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Fotografías {loading ? "..." : `(${photos.length})`}
        </span>
        {canEdit && (
          <>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="text-xs border border-border rounded px-2 py-1 hover:bg-muted disabled:opacity-50"
            >
              {uploading ? "Subiendo..." : "+ Subir foto"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFilePicked(f);
              }}
            />
          </>
        )}
      </div>

      {photos.length === 0 && !loading && (
        <div className="text-xs text-muted-foreground text-center py-4 border border-dashed border-border rounded">
          Sin fotos para este elemento.
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {photos.map((p) => (
          <button
            key={p.id}
            onClick={() => setPreview(p)}
            className="aspect-square overflow-hidden rounded border border-border hover:opacity-90"
          >
            {p.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.url}
                alt={p.caption ?? ""}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-muted flex items-center justify-center text-[10px] text-muted-foreground">
                Sin URL
              </div>
            )}
          </button>
        ))}
      </div>

      {preview && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="bg-card rounded-lg max-w-3xl w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {preview.url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview.url}
                alt={preview.caption ?? ""}
                className="w-full max-h-[70vh] object-contain bg-black"
              />
            )}
            <div className="p-4 flex justify-between items-center text-xs">
              <div className="text-muted-foreground">
                {new Date(preview.uploadedAt).toLocaleString("es-CO")}
                {preview.sizeBytes
                  ? ` · ${(preview.sizeBytes / 1024).toFixed(0)} KB`
                  : ""}
              </div>
              <div className="flex gap-2">
                {preview.url && (
                  <a
                    href={preview.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                    className="border border-border rounded px-3 py-1 hover:bg-muted"
                  >
                    Descargar
                  </a>
                )}
                {canEdit && (
                  <button
                    onClick={() => deletePhoto(preview)}
                    className="border border-destructive text-destructive rounded px-3 py-1 hover:bg-red-50"
                  >
                    Eliminar
                  </button>
                )}
                <button
                  onClick={() => setPreview(null)}
                  className="border border-border rounded px-3 py-1 hover:bg-muted"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
