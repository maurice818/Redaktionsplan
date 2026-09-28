// AUTOMATISCH ERZEUGT – nicht von Hand bearbeiten.
// Quelle: supabase/migrations (erzeugt mit `npm run db:types`).
// Format kompatibel zu `supabase gen types typescript`.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "13"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          value: Json
          label: string | null
          description: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          key: string
          value: Json
          label?: string | null
          description?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          key?: string
          value?: Json
          label?: string | null
          description?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      approvals: {
        Row: {
          id: string
          content_item_id: string
          content_version_id: string
          dossier_id: string
          kind: string
          decision: string
          comment: string | null
          decided_at: string
          decided_by: string | null
          approver_name: string | null
          approver_email: string | null
          approver_position: string | null
          preview_id: string | null
          preview_item_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          content_item_id: string
          content_version_id: string
          dossier_id: string
          kind: string
          decision: string
          comment?: string | null
          decided_at?: string
          decided_by?: string | null
          approver_name?: string | null
          approver_email?: string | null
          approver_position?: string | null
          preview_id?: string | null
          preview_item_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          content_item_id?: string
          content_version_id?: string
          dossier_id?: string
          kind?: string
          decision?: string
          comment?: string | null
          decided_at?: string
          decided_by?: string | null
          approver_name?: string | null
          approver_email?: string | null
          approver_position?: string | null
          preview_id?: string | null
          preview_item_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approvals_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_content_version_id_fkey"
            columns: ["content_version_id"]
            isOneToOne: false
            referencedRelation: "content_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          id: number
          occurred_at: string
          actor_id: string | null
          actor_label: string | null
          action: string
          entity_type: string
          entity_id: string | null
          dossier_id: string | null
          client_id: string | null
          summary: string | null
          changes: Json | null
          reason: string | null
        }
        Insert: {
          occurred_at?: string
          actor_id?: string | null
          actor_label?: string | null
          action: string
          entity_type: string
          entity_id?: string | null
          dossier_id?: string | null
          client_id?: string | null
          summary?: string | null
          changes?: Json | null
          reason?: string | null
        }
        Update: {
          occurred_at?: string
          actor_id?: string | null
          actor_label?: string | null
          action?: string
          entity_type?: string
          entity_id?: string | null
          dossier_id?: string | null
          client_id?: string | null
          summary?: string | null
          changes?: Json | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          id: string
          name: string
          goal: string | null
          description: string | null
          start_date: string | null
          end_date: string | null
          owner_id: string | null
          status: string
          topics: string[]
          is_demo: boolean
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          name: string
          goal?: string | null
          description?: string | null
          start_date?: string | null
          end_date?: string | null
          owner_id?: string | null
          status?: string
          topics?: string[]
          is_demo?: boolean
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          name?: string
          goal?: string | null
          description?: string | null
          start_date?: string | null
          end_date?: string | null
          owner_id?: string | null
          status?: string
          topics?: string[]
          is_demo?: boolean
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          id: string
          name: string
          legal_name: string | null
          category: string | null
          website: string | null
          email: string | null
          phone: string | null
          street: string | null
          postal_code: string | null
          city: string | null
          country: string | null
          owner_id: string | null
          status: string
          notes: string | null
          links: Json
          is_demo: boolean
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          name: string
          legal_name?: string | null
          category?: string | null
          website?: string | null
          email?: string | null
          phone?: string | null
          street?: string | null
          postal_code?: string | null
          city?: string | null
          country?: string | null
          owner_id?: string | null
          status?: string
          notes?: string | null
          links?: Json
          is_demo?: boolean
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          name?: string
          legal_name?: string | null
          category?: string | null
          website?: string | null
          email?: string | null
          phone?: string | null
          street?: string | null
          postal_code?: string | null
          city?: string | null
          country?: string | null
          owner_id?: string | null
          status?: string
          notes?: string | null
          links?: Json
          is_demo?: boolean
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          id: string
          client_id: string
          first_name: string | null
          last_name: string
          position: string | null
          email: string | null
          phone: string | null
          is_primary: boolean
          can_approve: boolean
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_id: string
          first_name?: string | null
          last_name: string
          position?: string | null
          email?: string | null
          phone?: string | null
          is_primary?: boolean
          can_approve?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          client_id?: string
          first_name?: string | null
          last_name?: string
          position?: string | null
          email?: string | null
          phone?: string | null
          is_primary?: boolean
          can_approve?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      content_items: {
        Row: {
          id: string
          dossier_id: string
          kind: string
          channel: string
          parent_id: string | null
          deliverable_id: string | null
          title: string
          teaser: string | null
          body_html: string | null
          seo_title: string | null
          meta_description: string | null
          author_name: string | null
          caption: string | null
          cta: string | null
          hashtags: string[]
          link_url: string | null
          post_format: string | null
          status: string
          assignee_id: string | null
          requires_internal_approval: boolean
          requires_client_approval: boolean
          fingerprint: string
          current_version_no: number
          internal_approval_id: string | null
          internal_ok: boolean
          internal_version_no: number | null
          client_approval_id: string | null
          client_ok: boolean
          client_version_no: number | null
          approvals_complete: boolean
          approval_invalidated_at: string | null
          schedule_status: string
          scheduled_at: string | null
          window_start: string | null
          window_end: string | null
          platform_account_id: string | null
          auto_publish: boolean
          authorized_by: string | null
          authorized_at: string | null
          published_at: string | null
          published_url: string | null
          publish_method: string | null
          external_post_id: string | null
          metrics: Json | null
          notes: string | null
          created_at: string
          updated_at: string
          created_by: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          dossier_id: string
          kind: string
          channel: string
          parent_id?: string | null
          deliverable_id?: string | null
          title: string
          teaser?: string | null
          body_html?: string | null
          seo_title?: string | null
          meta_description?: string | null
          author_name?: string | null
          caption?: string | null
          cta?: string | null
          hashtags?: string[]
          link_url?: string | null
          post_format?: string | null
          status?: string
          assignee_id?: string | null
          requires_internal_approval?: boolean
          requires_client_approval?: boolean
          fingerprint?: string
          current_version_no?: number
          internal_approval_id?: string | null
          internal_ok?: boolean
          internal_version_no?: number | null
          client_approval_id?: string | null
          client_ok?: boolean
          client_version_no?: number | null
          approvals_complete?: boolean
          approval_invalidated_at?: string | null
          schedule_status?: string
          scheduled_at?: string | null
          window_start?: string | null
          window_end?: string | null
          platform_account_id?: string | null
          auto_publish?: boolean
          authorized_by?: string | null
          authorized_at?: string | null
          published_at?: string | null
          published_url?: string | null
          publish_method?: string | null
          external_post_id?: string | null
          metrics?: Json | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          dossier_id?: string
          kind?: string
          channel?: string
          parent_id?: string | null
          deliverable_id?: string | null
          title?: string
          teaser?: string | null
          body_html?: string | null
          seo_title?: string | null
          meta_description?: string | null
          author_name?: string | null
          caption?: string | null
          cta?: string | null
          hashtags?: string[]
          link_url?: string | null
          post_format?: string | null
          status?: string
          assignee_id?: string | null
          requires_internal_approval?: boolean
          requires_client_approval?: boolean
          fingerprint?: string
          current_version_no?: number
          internal_approval_id?: string | null
          internal_ok?: boolean
          internal_version_no?: number | null
          client_approval_id?: string | null
          client_ok?: boolean
          client_version_no?: number | null
          approvals_complete?: boolean
          approval_invalidated_at?: string | null
          schedule_status?: string
          scheduled_at?: string | null
          window_start?: string | null
          window_end?: string | null
          platform_account_id?: string | null
          auto_publish?: boolean
          authorized_by?: string | null
          authorized_at?: string | null
          published_at?: string | null
          published_url?: string | null
          publish_method?: string | null
          external_post_id?: string | null
          metrics?: Json | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_items_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_authorized_by_fkey"
            columns: ["authorized_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_client_approval_fk"
            columns: ["client_approval_id"]
            isOneToOne: false
            referencedRelation: "approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_deliverable_id_fkey"
            columns: ["deliverable_id"]
            isOneToOne: false
            referencedRelation: "deliverables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_internal_approval_fk"
            columns: ["internal_approval_id"]
            isOneToOne: false
            referencedRelation: "approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_platform_account_fk"
            columns: ["platform_account_id"]
            isOneToOne: false
            referencedRelation: "platform_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      content_media: {
        Row: {
          id: string
          content_item_id: string
          media_asset_id: string
          position: number
          role: string
          created_at: string
        }
        Insert: {
          id?: string
          content_item_id: string
          media_asset_id: string
          position?: number
          role?: string
          created_at?: string
        }
        Update: {
          id?: string
          content_item_id?: string
          media_asset_id?: string
          position?: number
          role?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_media_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_media_media_asset_id_fkey"
            columns: ["media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      content_versions: {
        Row: {
          id: string
          content_item_id: string
          version_no: number
          fingerprint: string
          snapshot: Json
          reason: string | null
          created_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          content_item_id: string
          version_no: number
          fingerprint: string
          snapshot: Json
          reason?: string | null
          created_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          content_item_id?: string
          version_no?: number
          fingerprint?: string
          snapshot?: Json
          reason?: string | null
          created_at?: string
          created_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_versions_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_years: {
        Row: {
          id: string
          contract_id: string
          year_no: number
          start_date: string
          end_date: string
          created_at: string
        }
        Insert: {
          id?: string
          contract_id: string
          year_no: number
          start_date: string
          end_date: string
          created_at?: string
        }
        Update: {
          id?: string
          contract_id?: string
          year_no?: number
          start_date?: string
          end_date?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_years_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          id: string
          client_id: string
          package_template_id: string | null
          package_key: string | null
          package_name: string
          package_revision: number | null
          package_snapshot: Json
          start_date: string
          end_date: string
          renewal_date: string | null
          auto_renew: boolean
          status: string
          owner_id: string | null
          notes: string | null
          is_demo: boolean
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          client_id: string
          package_template_id?: string | null
          package_key?: string | null
          package_name: string
          package_revision?: number | null
          package_snapshot?: Json
          start_date: string
          end_date: string
          renewal_date?: string | null
          auto_renew?: boolean
          status?: string
          owner_id?: string | null
          notes?: string | null
          is_demo?: boolean
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          client_id?: string
          package_template_id?: string | null
          package_key?: string | null
          package_name?: string
          package_revision?: number | null
          package_snapshot?: Json
          start_date?: string
          end_date?: string
          renewal_date?: string | null
          auto_renew?: boolean
          status?: string
          owner_id?: string | null
          notes?: string | null
          is_demo?: boolean
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_package_template_id_fkey"
            columns: ["package_template_id"]
            isOneToOne: false
            referencedRelation: "package_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      deliverables: {
        Row: {
          id: string
          client_id: string
          contract_id: string | null
          contract_year_id: string | null
          service_type_id: string
          title: string
          description: string | null
          source: string
          template_item_id: string | null
          unit_no: number | null
          unit_count: number | null
          parent_deliverable_id: string | null
          content_kind: string | null
          status: string
          owner_id: string | null
          due_date: string | null
          fulfilled_at: string | null
          fulfillment_note: string | null
          evidence_url: string | null
          cancel_reason: string | null
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          client_id: string
          contract_id?: string | null
          contract_year_id?: string | null
          service_type_id: string
          title: string
          description?: string | null
          source?: string
          template_item_id?: string | null
          unit_no?: number | null
          unit_count?: number | null
          parent_deliverable_id?: string | null
          content_kind?: string | null
          status?: string
          owner_id?: string | null
          due_date?: string | null
          fulfilled_at?: string | null
          fulfillment_note?: string | null
          evidence_url?: string | null
          cancel_reason?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          client_id?: string
          contract_id?: string | null
          contract_year_id?: string | null
          service_type_id?: string
          title?: string
          description?: string | null
          source?: string
          template_item_id?: string | null
          unit_no?: number | null
          unit_count?: number | null
          parent_deliverable_id?: string | null
          content_kind?: string | null
          status?: string
          owner_id?: string | null
          due_date?: string | null
          fulfilled_at?: string | null
          fulfillment_note?: string | null
          evidence_url?: string | null
          cancel_reason?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deliverables_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliverables_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliverables_contract_year_id_fkey"
            columns: ["contract_year_id"]
            isOneToOne: false
            referencedRelation: "contract_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliverables_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliverables_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliverables_parent_deliverable_id_fkey"
            columns: ["parent_deliverable_id"]
            isOneToOne: false
            referencedRelation: "deliverables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliverables_service_type_id_fkey"
            columns: ["service_type_id"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["id"]
          },
        ]
      }
      dossiers: {
        Row: {
          id: string
          title: string
          kind: string
          client_id: string | null
          contract_id: string | null
          deliverable_id: string | null
          campaign_id: string | null
          idea_id: string | null
          contact_id: string | null
          own_category: string | null
          topic: string | null
          goal: string | null
          target_audience: string | null
          key_message: string | null
          owner_id: string | null
          period_start: string | null
          period_end: string | null
          status: string
          notes: string | null
          is_demo: boolean
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          title: string
          kind: string
          client_id?: string | null
          contract_id?: string | null
          deliverable_id?: string | null
          campaign_id?: string | null
          idea_id?: string | null
          contact_id?: string | null
          own_category?: string | null
          topic?: string | null
          goal?: string | null
          target_audience?: string | null
          key_message?: string | null
          owner_id?: string | null
          period_start?: string | null
          period_end?: string | null
          status?: string
          notes?: string | null
          is_demo?: boolean
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          title?: string
          kind?: string
          client_id?: string | null
          contract_id?: string | null
          deliverable_id?: string | null
          campaign_id?: string | null
          idea_id?: string | null
          contact_id?: string | null
          own_category?: string | null
          topic?: string | null
          goal?: string | null
          target_audience?: string | null
          key_message?: string | null
          owner_id?: string | null
          period_start?: string | null
          period_end?: string | null
          status?: string
          notes?: string | null
          is_demo?: boolean
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dossiers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossiers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossiers_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossiers_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossiers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossiers_deliverable_id_fkey"
            columns: ["deliverable_id"]
            isOneToOne: false
            referencedRelation: "deliverables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossiers_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossiers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_events: {
        Row: {
          id: string
          template_key: string | null
          to_email: string
          to_name: string | null
          subject: string
          status: string
          provider: string | null
          provider_message_id: string | null
          error: string | null
          idempotency_key: string | null
          dossier_id: string | null
          client_id: string | null
          material_request_id: string | null
          preview_id: string | null
          task_id: string | null
          triggered_by: string
          attempts: number
          created_at: string
          sent_at: string | null
          created_by: string | null
        }
        Insert: {
          id?: string
          template_key?: string | null
          to_email: string
          to_name?: string | null
          subject: string
          status?: string
          provider?: string | null
          provider_message_id?: string | null
          error?: string | null
          idempotency_key?: string | null
          dossier_id?: string | null
          client_id?: string | null
          material_request_id?: string | null
          preview_id?: string | null
          task_id?: string | null
          triggered_by?: string
          attempts?: number
          created_at?: string
          sent_at?: string | null
          created_by?: string | null
        }
        Update: {
          id?: string
          template_key?: string | null
          to_email?: string
          to_name?: string | null
          subject?: string
          status?: string
          provider?: string | null
          provider_message_id?: string | null
          error?: string | null
          idempotency_key?: string | null
          dossier_id?: string | null
          client_id?: string | null
          material_request_id?: string | null
          preview_id?: string | null
          task_id?: string | null
          triggered_by?: string
          attempts?: number
          created_at?: string
          sent_at?: string | null
          created_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_events_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_events_material_request_id_fkey"
            columns: ["material_request_id"]
            isOneToOne: false
            referencedRelation: "material_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_events_preview_id_fkey"
            columns: ["preview_id"]
            isOneToOne: false
            referencedRelation: "previews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          key: string
          name: string
          description: string | null
          audience: string
          subject: string
          body: string
          placeholders: string[]
          is_active: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          key: string
          name: string
          description?: string | null
          audience: string
          subject: string
          body: string
          placeholders?: string[]
          is_active?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          key?: string
          name?: string
          description?: string | null
          audience?: string
          subject?: string
          body?: string
          placeholders?: string[]
          is_active?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      format_rules: {
        Row: {
          id: string
          channel: string
          post_format: string
          media_kind: string
          label: string
          media_required: boolean
          allowed_mime_types: string[]
          max_file_size_mb: number | null
          min_width: number | null
          max_width: number | null
          max_pixels: number | null
          recommended_width: number | null
          recommended_height: number | null
          min_aspect_ratio: number | null
          max_aspect_ratio: number | null
          min_duration_seconds: number | null
          max_duration_seconds: number | null
          min_items: number | null
          max_items: number | null
          caption_max_length: number | null
          hashtags_max: number | null
          api_supported: boolean
          notes: string | null
          source_url: string | null
          verified_at: string | null
          is_active: boolean
          created_at: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          channel: string
          post_format: string
          media_kind: string
          label: string
          media_required?: boolean
          allowed_mime_types?: string[]
          max_file_size_mb?: number | null
          min_width?: number | null
          max_width?: number | null
          max_pixels?: number | null
          recommended_width?: number | null
          recommended_height?: number | null
          min_aspect_ratio?: number | null
          max_aspect_ratio?: number | null
          min_duration_seconds?: number | null
          max_duration_seconds?: number | null
          min_items?: number | null
          max_items?: number | null
          caption_max_length?: number | null
          hashtags_max?: number | null
          api_supported?: boolean
          notes?: string | null
          source_url?: string | null
          verified_at?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          channel?: string
          post_format?: string
          media_kind?: string
          label?: string
          media_required?: boolean
          allowed_mime_types?: string[]
          max_file_size_mb?: number | null
          min_width?: number | null
          max_width?: number | null
          max_pixels?: number | null
          recommended_width?: number | null
          recommended_height?: number | null
          min_aspect_ratio?: number | null
          max_aspect_ratio?: number | null
          min_duration_seconds?: number | null
          max_duration_seconds?: number | null
          min_items?: number | null
          max_items?: number | null
          caption_max_length?: number | null
          hashtags_max?: number | null
          api_supported?: boolean
          notes?: string | null
          source_url?: string | null
          verified_at?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "format_rules_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ideas: {
        Row: {
          id: string
          title: string
          description: string | null
          tags: string[]
          campaign_id: string | null
          client_id: string | null
          status: string
          is_reusable: boolean
          use_count: number
          is_demo: boolean
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          tags?: string[]
          campaign_id?: string | null
          client_id?: string | null
          status?: string
          is_reusable?: boolean
          use_count?: number
          is_demo?: boolean
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          tags?: string[]
          campaign_id?: string | null
          client_id?: string | null
          status?: string
          is_reusable?: boolean
          use_count?: number
          is_demo?: boolean
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ideas_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ideas_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ideas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_locks: {
        Row: {
          job: string
          run_id: string
          locked_until: string
        }
        Insert: {
          job: string
          run_id: string
          locked_until: string
        }
        Update: {
          job?: string
          run_id?: string
          locked_until?: string
        }
        Relationships: []
      }
      job_runs: {
        Row: {
          id: string
          job: string
          trigger: string
          started_at: string
          finished_at: string | null
          status: string
          summary: Json | null
          error: string | null
        }
        Insert: {
          id?: string
          job: string
          trigger?: string
          started_at?: string
          finished_at?: string | null
          status?: string
          summary?: Json | null
          error?: string | null
        }
        Update: {
          id?: string
          job?: string
          trigger?: string
          started_at?: string
          finished_at?: string | null
          status?: string
          summary?: Json | null
          error?: string | null
        }
        Relationships: []
      }
      material_forms: {
        Row: {
          id: string
          name: string
          description: string | null
          intro_text: string | null
          fields: Json
          is_default: boolean
          is_active: boolean
          created_at: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          intro_text?: string | null
          fields: Json
          is_default?: boolean
          is_active?: boolean
          created_at?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          intro_text?: string | null
          fields?: Json
          is_default?: boolean
          is_active?: boolean
          created_at?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_forms_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      material_requests: {
        Row: {
          id: string
          dossier_id: string
          client_id: string | null
          contact_id: string | null
          form_id: string | null
          form_snapshot: Json
          recipient_name: string | null
          recipient_email: string | null
          message: string | null
          token_hash: string
          token_encrypted: string | null
          expires_at: string
          revoked_at: string | null
          revoked_by: string | null
          status: string
          due_date: string | null
          sent_at: string | null
          first_opened_at: string | null
          last_saved_at: string | null
          submitted_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          review_note: string | null
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          dossier_id: string
          client_id?: string | null
          contact_id?: string | null
          form_id?: string | null
          form_snapshot: Json
          recipient_name?: string | null
          recipient_email?: string | null
          message?: string | null
          token_hash: string
          token_encrypted?: string | null
          expires_at: string
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          due_date?: string | null
          sent_at?: string | null
          first_opened_at?: string | null
          last_saved_at?: string | null
          submitted_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          review_note?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          dossier_id?: string
          client_id?: string | null
          contact_id?: string | null
          form_id?: string | null
          form_snapshot?: Json
          recipient_name?: string | null
          recipient_email?: string | null
          message?: string | null
          token_hash?: string
          token_encrypted?: string | null
          expires_at?: string
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          due_date?: string | null
          sent_at?: string | null
          first_opened_at?: string | null
          last_saved_at?: string | null
          submitted_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          review_note?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requests_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requests_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requests_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "material_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requests_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      material_responses: {
        Row: {
          request_id: string
          answers: Json
          submitted_by_name: string | null
          submitted_by_email: string | null
          revision: number
          updated_at: string
          submitted_at: string | null
        }
        Insert: {
          request_id: string
          answers?: Json
          submitted_by_name?: string | null
          submitted_by_email?: string | null
          revision?: number
          updated_at?: string
          submitted_at?: string | null
        }
        Update: {
          request_id?: string
          answers?: Json
          submitted_by_name?: string | null
          submitted_by_email?: string | null
          revision?: number
          updated_at?: string
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_responses_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "material_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      media_assets: {
        Row: {
          id: string
          dossier_id: string | null
          client_id: string | null
          kind: string
          source: string
          storage_bucket: string | null
          storage_path: string | null
          external_url: string | null
          file_name: string
          mime_type: string | null
          size_bytes: number | null
          width: number | null
          height: number | null
          duration_seconds: number | null
          title: string | null
          alt_text: string | null
          credit: string | null
          rights_note: string | null
          internal_note: string | null
          status: string
          supersedes_id: string | null
          uploaded_via: string
          material_request_id: string | null
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          dossier_id?: string | null
          client_id?: string | null
          kind: string
          source: string
          storage_bucket?: string | null
          storage_path?: string | null
          external_url?: string | null
          file_name: string
          mime_type?: string | null
          size_bytes?: number | null
          width?: number | null
          height?: number | null
          duration_seconds?: number | null
          title?: string | null
          alt_text?: string | null
          credit?: string | null
          rights_note?: string | null
          internal_note?: string | null
          status?: string
          supersedes_id?: string | null
          uploaded_via?: string
          material_request_id?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          dossier_id?: string | null
          client_id?: string | null
          kind?: string
          source?: string
          storage_bucket?: string | null
          storage_path?: string | null
          external_url?: string | null
          file_name?: string
          mime_type?: string | null
          size_bytes?: number | null
          width?: number | null
          height?: number | null
          duration_seconds?: number | null
          title?: string | null
          alt_text?: string | null
          credit?: string | null
          rights_note?: string | null
          internal_note?: string | null
          status?: string
          supersedes_id?: string | null
          uploaded_via?: string
          material_request_id?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_assets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_assets_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_assets_material_request_fk"
            columns: ["material_request_id"]
            isOneToOne: false
            referencedRelation: "material_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_assets_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          id: string
          recipient_id: string
          kind: string
          title: string
          body: string | null
          link: string | null
          dedupe_key: string | null
          read_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          recipient_id: string
          kind: string
          title: string
          body?: string | null
          link?: string | null
          dedupe_key?: string | null
          read_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          recipient_id?: string
          kind?: string
          title?: string
          body?: string | null
          link?: string | null
          dedupe_key?: string | null
          read_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      package_template_items: {
        Row: {
          id: string
          template_id: string
          service_type_id: string
          label: string | null
          quantity: number | null
          period: string
          per_parent_item_id: string | null
          quantity_per_parent: number | null
          notes: string | null
          sort_order: number
        }
        Insert: {
          id?: string
          template_id: string
          service_type_id: string
          label?: string | null
          quantity?: number | null
          period?: string
          per_parent_item_id?: string | null
          quantity_per_parent?: number | null
          notes?: string | null
          sort_order?: number
        }
        Update: {
          id?: string
          template_id?: string
          service_type_id?: string
          label?: string | null
          quantity?: number | null
          period?: string
          per_parent_item_id?: string | null
          quantity_per_parent?: number | null
          notes?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "package_template_items_per_parent_item_id_fkey"
            columns: ["per_parent_item_id"]
            isOneToOne: false
            referencedRelation: "package_template_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_template_items_service_type_id_fkey"
            columns: ["service_type_id"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "package_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      package_templates: {
        Row: {
          id: string
          key: string
          name: string
          description: string | null
          is_active: boolean
          revision: number
          sort_order: number
          created_at: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          key: string
          name: string
          description?: string | null
          is_active?: boolean
          revision?: number
          sort_order?: number
          created_at?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          key?: string
          name?: string
          description?: string | null
          is_active?: boolean
          revision?: number
          sort_order?: number
          created_at?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "package_templates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_accounts: {
        Row: {
          id: string
          platform: string
          display_name: string
          external_id: string | null
          auth_type: string | null
          api_enabled: boolean
          connection_status: string
          token_expires_at: string | null
          scopes: string[]
          last_checked_at: string | null
          last_error: string | null
          connected_by: string | null
          connected_at: string | null
          is_default: boolean
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          platform: string
          display_name: string
          external_id?: string | null
          auth_type?: string | null
          api_enabled?: boolean
          connection_status?: string
          token_expires_at?: string | null
          scopes?: string[]
          last_checked_at?: string | null
          last_error?: string | null
          connected_by?: string | null
          connected_at?: string | null
          is_default?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          platform?: string
          display_name?: string
          external_id?: string | null
          auth_type?: string | null
          api_enabled?: boolean
          connection_status?: string
          token_expires_at?: string | null
          scopes?: string[]
          last_checked_at?: string | null
          last_error?: string | null
          connected_by?: string | null
          connected_at?: string | null
          is_default?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_accounts_connected_by_fkey"
            columns: ["connected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_credentials: {
        Row: {
          account_id: string
          access_token_enc: string
          refresh_token_enc: string | null
          expires_at: string | null
          refresh_expires_at: string | null
          meta: Json
          updated_at: string
        }
        Insert: {
          account_id: string
          access_token_enc: string
          refresh_token_enc?: string | null
          expires_at?: string | null
          refresh_expires_at?: string | null
          meta?: Json
          updated_at?: string
        }
        Update: {
          account_id?: string
          access_token_enc?: string
          refresh_token_enc?: string | null
          expires_at?: string | null
          refresh_expires_at?: string | null
          meta?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_credentials_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "platform_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      preview_items: {
        Row: {
          id: string
          preview_id: string
          content_item_id: string
          content_version_id: string
          proposed_start: string | null
          proposed_end: string | null
          proposed_at: string | null
          position: number
          decision: string | null
          decision_comment: string | null
          decided_at: string | null
          approval_id: string | null
        }
        Insert: {
          id?: string
          preview_id: string
          content_item_id: string
          content_version_id: string
          proposed_start?: string | null
          proposed_end?: string | null
          proposed_at?: string | null
          position?: number
          decision?: string | null
          decision_comment?: string | null
          decided_at?: string | null
          approval_id?: string | null
        }
        Update: {
          id?: string
          preview_id?: string
          content_item_id?: string
          content_version_id?: string
          proposed_start?: string | null
          proposed_end?: string | null
          proposed_at?: string | null
          position?: number
          decision?: string | null
          decision_comment?: string | null
          decided_at?: string | null
          approval_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "preview_items_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preview_items_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preview_items_content_version_id_fkey"
            columns: ["content_version_id"]
            isOneToOne: false
            referencedRelation: "content_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preview_items_preview_id_fkey"
            columns: ["preview_id"]
            isOneToOne: false
            referencedRelation: "previews"
            referencedColumns: ["id"]
          },
        ]
      }
      previews: {
        Row: {
          id: string
          dossier_id: string
          client_id: string | null
          contact_id: string | null
          recipient_name: string | null
          recipient_email: string | null
          message: string | null
          token_hash: string
          token_encrypted: string | null
          expires_at: string
          revoked_at: string | null
          revoked_by: string | null
          status: string
          round: number
          replaces_preview_id: string | null
          response_due_date: string | null
          sent_at: string | null
          first_viewed_at: string | null
          last_viewed_at: string | null
          responded_at: string | null
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          dossier_id: string
          client_id?: string | null
          contact_id?: string | null
          recipient_name?: string | null
          recipient_email?: string | null
          message?: string | null
          token_hash: string
          token_encrypted?: string | null
          expires_at: string
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          round?: number
          replaces_preview_id?: string | null
          response_due_date?: string | null
          sent_at?: string | null
          first_viewed_at?: string | null
          last_viewed_at?: string | null
          responded_at?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          dossier_id?: string
          client_id?: string | null
          contact_id?: string | null
          recipient_name?: string | null
          recipient_email?: string | null
          message?: string | null
          token_hash?: string
          token_encrypted?: string | null
          expires_at?: string
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          round?: number
          replaces_preview_id?: string | null
          response_due_date?: string | null
          sent_at?: string | null
          first_viewed_at?: string | null
          last_viewed_at?: string | null
          responded_at?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "previews_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "previews_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "previews_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "previews_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "previews_replaces_preview_id_fkey"
            columns: ["replaces_preview_id"]
            isOneToOne: false
            referencedRelation: "previews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "previews_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string
          role: string
          is_active: boolean
          job_title: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email?: string
          full_name?: string
          role?: string
          is_active?: boolean
          job_title?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string
          role?: string
          is_active?: boolean
          job_title?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      publish_attempts: {
        Row: {
          id: string
          job_id: string
          run_id: string | null
          step: string
          started_at: string
          finished_at: string | null
          outcome: string
          http_status: number | null
          request_summary: Json | null
          response: Json | null
          error_message: string | null
          actor_id: string | null
        }
        Insert: {
          id?: string
          job_id: string
          run_id?: string | null
          step: string
          started_at?: string
          finished_at?: string | null
          outcome: string
          http_status?: number | null
          request_summary?: Json | null
          response?: Json | null
          error_message?: string | null
          actor_id?: string | null
        }
        Update: {
          id?: string
          job_id?: string
          run_id?: string | null
          step?: string
          started_at?: string
          finished_at?: string | null
          outcome?: string
          http_status?: number | null
          request_summary?: Json | null
          response?: Json | null
          error_message?: string | null
          actor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "publish_attempts_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publish_attempts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "publish_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      publish_jobs: {
        Row: {
          id: string
          content_item_id: string
          dossier_id: string
          content_version_id: string | null
          channel: string
          platform_account_id: string | null
          method: string
          status: string
          scheduled_at: string
          locked_at: string | null
          locked_by: string | null
          attempt_count: number
          next_check_at: string | null
          external_container_id: string | null
          external_post_id: string | null
          published_url: string | null
          published_at: string | null
          last_error: string | null
          manual_reason: string | null
          cancel_reason: string | null
          confirmed_by: string | null
          confirmed_at: string | null
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          content_item_id: string
          dossier_id: string
          content_version_id?: string | null
          channel: string
          platform_account_id?: string | null
          method: string
          status?: string
          scheduled_at: string
          locked_at?: string | null
          locked_by?: string | null
          attempt_count?: number
          next_check_at?: string | null
          external_container_id?: string | null
          external_post_id?: string | null
          published_url?: string | null
          published_at?: string | null
          last_error?: string | null
          manual_reason?: string | null
          cancel_reason?: string | null
          confirmed_by?: string | null
          confirmed_at?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          content_item_id?: string
          dossier_id?: string
          content_version_id?: string | null
          channel?: string
          platform_account_id?: string | null
          method?: string
          status?: string
          scheduled_at?: string
          locked_at?: string | null
          locked_by?: string | null
          attempt_count?: number
          next_check_at?: string | null
          external_container_id?: string | null
          external_post_id?: string | null
          published_url?: string | null
          published_at?: string | null
          last_error?: string | null
          manual_reason?: string | null
          cancel_reason?: string | null
          confirmed_by?: string | null
          confirmed_at?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "publish_jobs_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publish_jobs_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publish_jobs_content_version_id_fkey"
            columns: ["content_version_id"]
            isOneToOne: false
            referencedRelation: "content_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publish_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publish_jobs_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publish_jobs_platform_account_id_fkey"
            columns: ["platform_account_id"]
            isOneToOne: false
            referencedRelation: "platform_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_log: {
        Row: {
          id: string
          rule_key: string
          entity_id: string
          occurrence: number
          fired_at: string
          run_id: string | null
          outcome: Json | null
        }
        Insert: {
          id?: string
          rule_key: string
          entity_id: string
          occurrence?: number
          fired_at?: string
          run_id?: string | null
          outcome?: Json | null
        }
        Update: {
          id?: string
          rule_key?: string
          entity_id?: string
          occurrence?: number
          fired_at?: string
          run_id?: string | null
          outcome?: Json | null
        }
        Relationships: []
      }
      reminder_rules: {
        Row: {
          key: string
          name: string
          description: string | null
          is_active: boolean
          days: number
          repeat_days: number | null
          max_reminders: number
          notify_customer: boolean
          notify_team: boolean
          customer_template_key: string | null
          team_template_key: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          key: string
          name: string
          description?: string | null
          is_active?: boolean
          days?: number
          repeat_days?: number | null
          max_reminders?: number
          notify_customer?: boolean
          notify_team?: boolean
          customer_template_key?: string | null
          team_template_key?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          key?: string
          name?: string
          description?: string | null
          is_active?: boolean
          days?: number
          repeat_days?: number | null
          max_reminders?: number
          notify_customer?: boolean
          notify_team?: boolean
          customer_template_key?: string | null
          team_template_key?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reminder_rules_customer_template_key_fkey"
            columns: ["customer_template_key"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "reminder_rules_team_template_key_fkey"
            columns: ["team_template_key"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "reminder_rules_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_filters: {
        Row: {
          id: string
          owner_id: string
          view: string
          name: string
          params: Json
          is_shared: boolean
          created_at: string
        }
        Insert: {
          id?: string
          owner_id?: string
          view: string
          name: string
          params?: Json
          is_shared?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          owner_id?: string
          view?: string
          name?: string
          params?: Json
          is_shared?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_filters_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_types: {
        Row: {
          id: string
          key: string
          name: string
          description: string | null
          category: string
          content_kind: string | null
          is_active: boolean
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          key: string
          name: string
          description?: string | null
          category?: string
          content_kind?: string | null
          is_active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          key?: string
          name?: string
          description?: string | null
          category?: string
          content_kind?: string | null
          is_active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          id: string
          title: string
          description: string | null
          task_type: string
          status: string
          priority: string
          assignee_id: string | null
          due_date: string | null
          dossier_id: string | null
          content_item_id: string | null
          client_id: string | null
          campaign_id: string | null
          deliverable_id: string | null
          publish_job_id: string | null
          origin: string
          auto_key: string | null
          waiting_since: string | null
          completed_at: string | null
          completed_by: string | null
          is_demo: boolean
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          task_type?: string
          status?: string
          priority?: string
          assignee_id?: string | null
          due_date?: string | null
          dossier_id?: string | null
          content_item_id?: string | null
          client_id?: string | null
          campaign_id?: string | null
          deliverable_id?: string | null
          publish_job_id?: string | null
          origin?: string
          auto_key?: string | null
          waiting_since?: string | null
          completed_at?: string | null
          completed_by?: string | null
          is_demo?: boolean
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          task_type?: string
          status?: string
          priority?: string
          assignee_id?: string | null
          due_date?: string | null
          dossier_id?: string | null
          content_item_id?: string | null
          client_id?: string | null
          campaign_id?: string | null
          deliverable_id?: string | null
          publish_job_id?: string | null
          origin?: string
          auto_key?: string | null
          waiting_since?: string | null
          completed_at?: string | null
          completed_by?: string | null
          is_demo?: boolean
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_deliverable_id_fkey"
            columns: ["deliverable_id"]
            isOneToOne: false
            referencedRelation: "deliverables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_publish_job_fk"
            columns: ["publish_job_id"]
            isOneToOne: false
            referencedRelation: "publish_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acquire_job_lock: {
        Args: {
            p_job: string | null
            p_run_id: string | null
            p_ttl_seconds: number | null
          }
        Returns: boolean
      }
      add_contract_year: {
        Args: {
            p_contract_id: string | null
          }
        Returns: string
      }
      add_deliverable: {
        Args: {
            p_client_id: string | null
            p_contract_id: string | null
            p_contract_year_id: string | null
            p_service_type_id: string | null
            p_title: string | null
            p_quantity: number | null
            p_source: string | null
            p_reason: string | null
            p_due_date?: string | null
            p_owner_id?: string | null
            p_description?: string | null
          }
        Returns: number
      }
      add_note: {
        Args: {
            p_dossier_id: string | null
            p_client_id: string | null
            p_text: string | null
          }
        Returns: undefined
      }
      admin_load_demo_data: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      admin_remove_demo_data: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      book_membership: {
        Args: {
            p_client_id: string | null
            p_template_id: string | null
            p_start_date: string | null
            p_end_date: string | null
            p_owner_id?: string | null
            p_auto_renew?: boolean | null
            p_renewal_date?: string | null
            p_notes?: string | null
          }
        Returns: string
      }
      cancel_publish_job: {
        Args: {
            p_job_id: string | null
            p_reason: string | null
          }
        Returns: undefined
      }
      claim_due_publish_jobs: {
        Args: {
            p_run_id: string | null
            p_limit?: number | null
          }
        Returns: Database["public"]["Tables"]["publish_jobs"]["Row"][]
      }
      claim_reminder: {
        Args: {
            p_rule_key: string | null
            p_entity_id: string | null
            p_occurrence: number | null
            p_run_id: string | null
          }
        Returns: boolean
      }
      confirm_manual_publication: {
        Args: {
            p_content_id: string | null
            p_url: string | null
            p_published_at: string | null
            p_note?: string | null
          }
        Returns: string
      }
      correct_deliverable: {
        Args: {
            p_id: string | null
            p_status: string | null
            p_title: string | null
            p_owner_id: string | null
            p_due_date: string | null
            p_evidence_url: string | null
            p_fulfillment_note: string | null
            p_cancel_reason: string | null
            p_reason: string | null
          }
        Returns: undefined
      }
      create_content_version: {
        Args: {
            p_content_id: string | null
            p_reason?: string | null
          }
        Returns: string
      }
      create_preview: {
        Args: {
            p_dossier_id: string | null
            p_content_ids: string[] | null
            p_recipient_name: string | null
            p_recipient_email: string | null
            p_contact_id: string | null
            p_message: string | null
            p_token_hash: string | null
            p_token_encrypted: string | null
            p_expires_at: string | null
            p_response_due_date?: string | null
          }
        Returns: string
      }
      decide_internal_review: {
        Args: {
            p_content_id: string | null
            p_decision: string | null
            p_comment?: string | null
          }
        Returns: string
      }
      finish_publish_job: {
        Args: {
            p_job_id: string | null
            p_run_id: string | null
            p_outcome: string | null
            p_external_post_id?: string | null
            p_published_url?: string | null
            p_published_at?: string | null
            p_container_id?: string | null
            p_next_check_at?: string | null
            p_error?: string | null
          }
        Returns: boolean
      }
      mark_stale_publish_jobs: {
        Args: {
            p_minutes?: number | null
          }
        Returns: number
      }
      public_get_material_request: {
        Args: {
            p_token: string | null
          }
        Returns: Json
      }
      public_get_preview: {
        Args: {
            p_token: string | null
          }
        Returns: Json
      }
      public_material_upload_target: {
        Args: {
            p_token: string | null
          }
        Returns: Json
      }
      public_register_material_file: {
        Args: {
            p_token: string | null
            p_storage_path: string | null
            p_file_name: string | null
            p_mime_type: string | null
            p_size_bytes: number | null
            p_width?: number | null
            p_height?: number | null
            p_credit?: string | null
            p_rights_note?: string | null
          }
        Returns: Json
      }
      public_remove_material_file: {
        Args: {
            p_token: string | null
            p_media_id: string | null
          }
        Returns: Json
      }
      public_save_material_response: {
        Args: {
            p_token: string | null
            p_answers: Json | null
            p_submit: boolean | null
            p_name: string | null
            p_email: string | null
          }
        Returns: Json
      }
      public_submit_preview_decisions: {
        Args: {
            p_token: string | null
            p_decisions: Json | null
            p_name: string | null
            p_email: string | null
            p_position: string | null
            p_confirmed: boolean | null
          }
        Returns: Json
      }
      record_content_metrics: {
        Args: {
            p_content_id: string | null
            p_reach: number | null
            p_impressions: number | null
            p_clicks: number | null
            p_note: string | null
          }
        Returns: undefined
      }
      record_publish_attempt: {
        Args: {
            p_job_id: string | null
            p_run_id: string | null
            p_step: string | null
            p_outcome: string | null
            p_http_status: number | null
            p_request_summary: Json | null
            p_response: Json | null
            p_error: string | null
          }
        Returns: string
      }
      record_reminder_outcome: {
        Args: {
            p_rule_key: string | null
            p_entity_id: string | null
            p_occurrence: number | null
            p_outcome: Json | null
          }
        Returns: undefined
      }
      release_job_lock: {
        Args: {
            p_job: string | null
            p_run_id: string | null
          }
        Returns: undefined
      }
      request_internal_review: {
        Args: {
            p_content_id: string | null
            p_note?: string | null
          }
        Returns: string
      }
      retry_publish_job: {
        Args: {
            p_job_id: string | null
            p_confirm_not_published?: boolean | null
          }
        Returns: undefined
      }
      review_material_request: {
        Args: {
            p_request_id: string | null
            p_outcome: string | null
            p_note?: string | null
          }
        Returns: undefined
      }
      revoke_material_request: {
        Args: {
            p_request_id: string | null
          }
        Returns: undefined
      }
      revoke_preview: {
        Args: {
            p_preview_id: string | null
          }
        Returns: undefined
      }
      schedule_content: {
        Args: {
            p_content_id: string | null
            p_mode: string | null
            p_scheduled_at: string | null
            p_auto_publish?: boolean | null
            p_platform_account_id?: string | null
            p_window_start?: string | null
            p_window_end?: string | null
          }
        Returns: Json
      }
      search_all: {
        Args: {
            p_query: string | null
            p_limit?: number | null
          }
        Returns: {
            entity_type: string
            id: string
            title: string
            subtitle: string
            url: string
          }[]
      }
      system_ensure_task: {
        Args: {
            p_auto_key: string | null
            p_title: string | null
            p_task_type: string | null
            p_assignee: string | null
            p_due_date: string | null
            p_dossier_id: string | null
            p_content_item_id: string | null
            p_description: string | null
            p_priority?: string | null
          }
        Returns: string
      }
      system_notify: {
        Args: {
            p_recipient: string | null
            p_kind: string | null
            p_title: string | null
            p_body: string | null
            p_link: string | null
            p_dedupe_key: string | null
          }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database["public"]

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"]
export type DbFunctions = PublicSchema["Functions"]
