"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";
import { Loader2, MessageSquare, Send } from "lucide-react";
import type { JobApplication, ApplicationTimelineEvent } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { doc, serverTimestamp, updateDoc, Timestamp } from "firebase/firestore";
import { useAuth } from "@/providers/auth-provider";
import { useFirestore } from "@/firebase";
import { useToast } from "@/hooks/use-toast";

interface ApplicationNotesProps {
  application: JobApplication;
  onNoteAdded: () => void;
}

export function ApplicationNotes({
  application,
  onNoteAdded,
}: ApplicationNotesProps) {
  const [newNote, setNewNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const notes =
    application.timeline
      ?.filter((event) => event.type === "note_added")
      .sort((a, b) => b.at.toMillis() - a.at.toMillis()) || [];

  const handleAddNote = async () => {
    if (!newNote.trim() || !userProfile) return;

    setIsSaving(true);
    const appRef = doc(firestore, "applications", application.id!);

    const noteEvent: ApplicationTimelineEvent = {
      type: "note_added",
      at: Timestamp.now(),
      by: userProfile.uid,
      meta: {
        note: newNote,
        authorName: userProfile.fullName,
      },
    };

    try {
      await updateDoc(appRef, {
        timeline: [...(application.timeline || []), noteEvent],
      });
      setNewNote("");
      onNoteAdded(); // This will trigger a re-fetch in the parent component
      toast({ title: "Catatan ditambahkan" });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Gagal menambah catatan",
        description: error.message,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Catatan Internal
        </CardTitle>
        <CardDescription>
          Catatan ini hanya dapat dilihat oleh tim HRD dan panelis wawancara.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Textarea
            placeholder="Tulis catatan di sini..."
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            rows={3}
          />
          <Button
            onClick={handleAddNote}
            disabled={isSaving || !newNote.trim()}
            className="w-full"
          >
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Tambah Catatan
          </Button>
        </div>
        <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
          {notes.length > 0 ? (
            notes.map((note, index) => (
              <div key={index} className="flex items-start gap-3 text-sm">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>
                    {getInitials(note.meta.authorName || "?")}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 rounded-md bg-muted/50 p-3">
                  <div className="flex justify-between items-center">
                    <p className="font-semibold">{note.meta.authorName}</p>
                    <p className="text-xs text-slate-600">
                      {formatDistanceToNow(note.at.toDate(), {
                        addSuffix: true,
                        locale: idLocale,
                      })}
                    </p>
                  </div>
                  <p className="whitespace-pre-wrap mt-1">{note.meta.note}</p>
                </div>
              </div>
            ))
          ) : (
            <p className="text-center text-sm text-slate-600 py-4">
              Belum ada catatan.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
