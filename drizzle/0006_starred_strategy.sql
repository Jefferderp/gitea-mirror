-- Starred Repository Organization Strategy Support

-- 1) Extend organizations with type and source owner
ALTER TABLE organizations ADD COLUMN organization_type TEXT DEFAULT 'joined' NOT NULL CHECK (organization_type IN ('joined', 'starred-owner'));
ALTER TABLE organizations ADD COLUMN source_owner TEXT;

-- 2) Index to accelerate filtering and lookups
CREATE INDEX IF NOT EXISTS idx_organizations_type_source ON organizations(organization_type, source_owner);

-- 3) Backfill existing rows
UPDATE organizations SET organization_type = 'joined' WHERE organization_type IS NULL;