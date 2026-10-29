import {
  DataSourceTypes,
  Immutable,
  React,
  type UseDataSource,
} from "jimu-core";
import { type AllWidgetSettingProps } from "jimu-for-builder";
import { Label, TextInput } from "jimu-ui";
import { DataSourceSelector } from "jimu-ui/advanced/data-source-selector";
import { MapWidgetSelector } from "jimu-ui/advanced/setting-components";
import {
  DEFAULT_PORTAL_URL,
  DEFAULT_ROLE,
  DEFAULT_TITLE,
  DEFAULT_WEBMAP_ITEM_ID,
  type IMConfig,
  type UnElektrRole,
} from "../config";
import defaultMessages from "./translations/default";

const Imm = Immutable as unknown as <T>(val: T) => any;

export default class Setting extends React.PureComponent<
  AllWidgetSettingProps<IMConfig>
> {
  private readonly layerTypes = Imm([
    DataSourceTypes.FeatureLayer,
    DataSourceTypes.SubtypeGroupLayer,
  ]);

  private nls(id: keyof typeof defaultMessages): string {
    return (
      this.props.intl?.formatMessage({
        id,
        defaultMessage: defaultMessages[id],
      }) || defaultMessages[id]
    );
  }

  private readPlain(): Record<string, unknown> {
    const cfg: any = this.props.config;
    if (!cfg) {
      return {
        title: DEFAULT_TITLE,
        tarixJadvalUrl: "",
        role: DEFAULT_ROLE,
        lineLayerTitle: "",
        deviceLayerTitle: "",
        webMapItemId: DEFAULT_WEBMAP_ITEM_ID,
        portalUrl: DEFAULT_PORTAL_URL,
      };
    }
    if (typeof cfg.asMutable === "function") {
      return cfg.asMutable({ deep: true });
    }
    if (typeof cfg.get === "function") {
      return {
        title: cfg.get("title"),
        tarixJadvalUrl: cfg.get("tarixJadvalUrl"),
        role: cfg.get("role"),
        lineLayerTitle: cfg.get("lineLayerTitle"),
        deviceLayerTitle: cfg.get("deviceLayerTitle"),
        webMapItemId: cfg.get("webMapItemId"),
        portalUrl: cfg.get("portalUrl"),
      };
    }
    return { ...cfg };
  }

  private updateConfig(patch: Record<string, unknown>): void {
    const current: any = this.props.config;
    const next =
      current && typeof current.merge === "function"
        ? current.merge(patch)
        : Imm({ ...this.readPlain(), ...patch });
    this.props.onSettingChange({ id: this.props.id, config: next });
  }

  private onMapSelected = (useMapWidgetIds: string[]): void => {
    this.props.onSettingChange({
      id: this.props.id,
      useMapWidgetIds: useMapWidgetIds || [],
    });
  };

  private onDataSourceChange = (useDataSources: UseDataSource[]): void => {
    this.props.onSettingChange({
      id: this.props.id,
      useDataSources: useDataSources || [],
    });
  };

  render(): React.ReactNode {
    const plain = this.readPlain();
    const title = String(plain.title || DEFAULT_TITLE);
    const tarixJadvalUrl = String(plain.tarixJadvalUrl || "");
    const role = String(plain.role || DEFAULT_ROLE) as UnElektrRole;
    const lineLayerTitle = String(plain.lineLayerTitle || "");
    const deviceLayerTitle = String(plain.deviceLayerTitle || "");
    const webMapItemId = String(plain.webMapItemId || DEFAULT_WEBMAP_ITEM_ID);
    const portalUrl = String(plain.portalUrl || DEFAULT_PORTAL_URL);
    const cfg = { til: String(plain.til || "uz"), mavzu: String(plain.mavzu || "auto") };

    return (
      <div className="unelektr-setting" style={{ padding: 16 }}>
        <div
          style={{
            marginBottom: 16,
            padding: 14,
            borderRadius: 8,
            border: "1px solid rgba(20,96,170,0.45)",
            background: "rgba(20,96,170,0.06)",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 15 }}>
            {this.nls("featureLayers")}
          </div>
          <div
            style={{
              fontSize: 12,
              opacity: 0.88,
              marginBottom: 12,
              lineHeight: 1.45,
            }}
          >
            {this.nls("featureLayersHint")}
          </div>
          <DataSourceSelector
            mustUseDataSource
            isMultiple
            types={this.layerTypes}
            useDataSources={this.props.useDataSources}
            onChange={this.onDataSourceChange}
            widgetId={this.props.id}
            hideDataView
          />
          <div
            style={{
              marginTop: 10,
              fontSize: 12,
              opacity: 0.75,
              lineHeight: 1.45,
            }}
          >
            {this.nls("featureLayersRoles")}
          </div>
        </div>

        <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 15 }}>
          {this.nls("mapWidget")}
        </div>
        <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 10, lineHeight: 1.45 }}>
          {this.nls("mapWidgetHint")}
        </div>
        <MapWidgetSelector
          useMapWidgetIds={this.props.useMapWidgetIds}
          onSelect={this.onMapSelected}
        />

        <Label style={{ display: "block", marginTop: 18, marginBottom: 6, fontWeight: 600 }}>
          {this.nls("title")}
        </Label>
        <TextInput
          className="w-100"
          value={title}
          onAcceptValue={(v) => this.updateConfig({ title: (v || "").trim() || DEFAULT_TITLE })}
        />

        <Label style={{ display: "block", marginTop: 16, marginBottom: 6, fontWeight: 600 }}>
          {this.nls("tarixJadvalUrl")}
        </Label>
        <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 8 }}>
          {this.nls("tarixJadvalUrlHint")}
        </div>
        <TextInput
          className="w-100"
          value={tarixJadvalUrl}
          onAcceptValue={(v) => this.updateConfig({ tarixJadvalUrl: (v || "").trim().replace(/\/$/, "") })}
          placeholder="https://…/FeatureServer/2"
        />

        <Label style={{ display: "block", marginTop: 16, marginBottom: 6, fontWeight: 600 }}>
          {this.nls("webMapItemId")}
        </Label>
        <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 8 }}>
          {this.nls("webMapItemIdHint")}
        </div>
        <TextInput
          className="w-100"
          value={webMapItemId}
          onAcceptValue={(v) =>
            this.updateConfig({
              webMapItemId: (v || "").trim() || DEFAULT_WEBMAP_ITEM_ID,
            })
          }
          placeholder={DEFAULT_WEBMAP_ITEM_ID}
        />
        <Label style={{ display: "block", marginTop: 12, marginBottom: 6, fontWeight: 600 }}>
          {this.nls("portalUrl")}
        </Label>
        <TextInput
          className="w-100"
          value={portalUrl}
          onAcceptValue={(v) =>
            this.updateConfig({
              portalUrl: (v || "").trim().replace(/\/$/, "") || DEFAULT_PORTAL_URL,
            })
          }
          placeholder={DEFAULT_PORTAL_URL}
        />

        <div style={{ fontSize: 12, opacity: 0.85, marginTop: 16, marginBottom: 8 }}>
          {this.nls("layerHint")}
        </div>
        <Label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
          {this.nls("lineLayerTitle")}
        </Label>
        <TextInput
          className="w-100"
          value={lineLayerTitle}
          onAcceptValue={(v) => this.updateConfig({ lineLayerTitle: (v || "").trim() })}
          placeholder="liniyalar / line"
        />
        <Label style={{ display: "block", marginTop: 12, marginBottom: 6, fontWeight: 600 }}>
          {this.nls("deviceLayerTitle")}
        </Label>
        <TextInput
          className="w-100"
          value={deviceLayerTitle}
          onAcceptValue={(v) => this.updateConfig({ deviceLayerTitle: (v || "").trim() })}
          placeholder="qurilmalar / device"
        />

        <Label style={{ display: "block", marginTop: 16, marginBottom: 6, fontWeight: 600 }}>
          {this.nls("role")}
        </Label>
        <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 8 }}>
          {this.nls("roleHint")}
        </div>
        <select
          className="w-100"
          style={{ height: 32, width: "100%" }}
          value={role}
          onChange={(e) =>
            this.updateConfig({ role: (e.target.value || DEFAULT_ROLE) as UnElektrRole })
          }
        >
          <option value="koruvchi">koruvchi</option>
          <option value="muharrir">muharrir</option>
          <option value="admin">admin</option>
        </select>

        <Label style={{ display: "block", marginTop: 16, marginBottom: 6, fontWeight: 600 }}>
          {this.nls("til")}
        </Label>
        <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 8 }}>
          {this.nls("tilHint")}
        </div>
        <select
          className="w-100"
          style={{ height: 32, width: "100%" }}
          value={cfg.til}
          onChange={(e) => this.updateConfig({ til: e.target.value as any })}
        >
          <option value="uz">O'zbekcha (lotin)</option>
          <option value="kr">Ўзбекча (кирилл)</option>
          <option value="ru">Русский</option>
        </select>

        <Label style={{ display: "block", marginTop: 16, marginBottom: 6, fontWeight: 600 }}>
          {this.nls("mavzu")}
        </Label>
        <select
          className="w-100"
          style={{ height: 32, width: "100%" }}
          value={cfg.mavzu}
          onChange={(e) => this.updateConfig({ mavzu: e.target.value as any })}
        >
          <option value="auto">{this.nls("mavzuAuto")}</option>
          <option value="light">{this.nls("mavzuLight")}</option>
          <option value="dark">{this.nls("mavzuDark")}</option>
        </select>
      </div>
    );
  }
}
