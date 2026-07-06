"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { agregarImagen, quitarMedio, reordenarMedios, type FormState } from "@/app/(admin)/contenido/actions";
import AddVideoForm from "./AddVideoForm";

export type EditorItem = {
  id: string;
  kind: "imagen" | "video";
  url: string | null; // imagen: signed url
  provider: string | null;
  orientation: string | null;
};

function Card({ item }: { item: EditorItem }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="media-card">
      <div className="media-thumb" {...attributes} {...listeners} title="Arrastra para reordenar">
        {item.kind === "imagen" && item.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.url} alt="" />
        ) : (
          <div className="media-video">
            <span className="media-video-play">▶</span>
            <span className="media-video-meta">{item.provider ?? "video"}<br />{item.orientation ?? ""}</span>
          </div>
        )}
      </div>
      <form action={quitarMedio}>
        <input type="hidden" name="media_id" value={item.id} />
        <button className="btn btn-sm btn-danger" type="submit" style={{ width: "100%" }}>Quitar</button>
      </form>
    </div>
  );
}

function AddImageForm({ versionId }: { versionId: string }) {
  const [state, formAction, pending] = useActionState(agregarImagen, { error: null } as FormState);
  return (
    <form action={formAction} className="form" style={{ maxWidth: "none" }}>
      <input type="hidden" name="version_id" value={versionId} />
      <div className="field">
        <label>Agregar imagen</label>
        <input type="file" name="image" accept="image/*" required />
      </div>
      {state.error && <div className="form-error">{state.error}</div>}
      <div className="form-actions">
        <button className="btn btn-sm btn-primary" disabled={pending}>{pending ? "Subiendo…" : "Agregar imagen"}</button>
      </div>
    </form>
  );
}

export default function MediaEditor({ versionId, initial }: { versionId: string; initial: EditorItem[] }) {
  const [items, setItems] = useState(initial);
  const router = useRouter();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldI = items.findIndex((i) => i.id === active.id);
    const newI = items.findIndex((i) => i.id === over.id);
    if (oldI < 0 || newI < 0) return;
    const next = arrayMove(items, oldI, newI);
    setItems(next); // optimista
    const fd = new FormData();
    fd.set("version_id", versionId);
    fd.set("order", JSON.stringify(next.map((i) => i.id)));
    await reordenarMedios(fd);
    router.refresh();
  }

  return (
    <div>
      {items.length > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
            <div className="media-grid">
              {items.map((it) => <Card key={it.id} item={it} />)}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="empty" style={{ padding: "20px" }}>Sin medios todavía. Agrega imágenes o videos.</div>
      )}

      <div className="media-add">
        <AddImageForm versionId={versionId} />
        <AddVideoForm versionId={versionId} />
      </div>
    </div>
  );
}
