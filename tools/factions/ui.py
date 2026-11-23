"""JSON UI for Factions Core.

Server forms whose title starts with one of our markers get our own layouts;
every other form (vanilla or other add-ons) is left exactly as it was.

  HUB   main dashboard: logo + navigation rail | header, 4x2 stat cards, text panel
  LIST  header | text panel + column of big icon buttons
  MODAL header | the normal input controls, in our frame

The HUD gets a sidebar that shows the last title starting with "fchud:".
"""
from markers import HUB, LIST, MODAL, CARD, HUD, BOARD, TILE, BANNER, ACTION, LOCKED

T = "textures/fc/ui/"
TEXT = [0.9, 0.96, 1.0]
ACCENT = [0.45, 0.82, 1.0]


def has(marker, var="#title_text"):
    return f"(not (({var} - '{marker}') = {var}))"


def lacks(*markers, var="#title_text"):
    sub = " - ".join(f"'{m}'" for m in markers)
    return f"(({var} - {sub}) = {var})"


def coll(name, override=None):
    b = {"binding_name": name, "binding_type": "collection", "binding_collection_name": "form_buttons"}
    if override:
        b["binding_name_override"] = override
    return b


def image(tex, size=("100%", "100%"), **kw):
    return {"type": "image", "texture": T + tex, "size": list(size), **kw}


def pad(w, h):
    return {"type": "panel", "size": [w, h]}


def button_states(tex, hover, press):
    return [
        {"default": image(tex)},
        {"hover": image(hover)},
        {"pressed": image(press)},
    ]


def icon_from_button(size):
    """The form button's image (set with .button(text, iconPath))."""
    return {"type": "panel", "size": [size, size], "controls": [{"img": {
        "type": "image", "size": [size, size], "layer": 3,
        "bindings": [
            coll("#form_button_texture", "#texture"),
            coll("#form_button_texture_file_system", "#texture_file_system"),
            {"binding_type": "view", "source_property_name": "(not ((#texture = '') or (#texture = 'loading')))", "target_property_name": "#visible"},
        ]}}]}


def button_label(scale=1.0, color=TEXT):
    return {"type": "label", "size": ["fill", "default"], "text": "#form_button_text", "color": color, "shadow": True,
            "font_scale_factor": scale, "layer": 3, "bindings": [coll("#form_button_text")]}


def form_button(height, tex, hover, press, icon, visible, chevron=True, scale=1.0, width="100%"):
    content = [
        {"pad_l": pad(4, "100%")},
        {"icon": icon_from_button(icon)},
        {"pad_m": pad(5, "100%")},
        {"text": button_label(scale)},
    ]
    if chevron:
        content.append({"chev": {"type": "label", "size": [10, "default"], "text": ">", "color": ACCENT, "layer": 3, "shadow": True}})
    return {
        "size": [width, height],
        "$pressed_button_name": "button.form_button_click",
        "default_control": "default", "hover_control": "hover", "pressed_control": "pressed",
        "controls": button_states(tex, hover, press) + [
            {"content": {"type": "stack_panel", "orientation": "horizontal", "size": ["100%", "100%"], "layer": 2, "controls": content}},
        ],
        "bindings": [
            {"binding_type": "collection_details", "binding_collection_name": "form_buttons"},
            coll("#form_button_text"),
            {"binding_type": "view", "source_property_name": visible, "target_property_name": "#visible"},
        ],
    }


def button_list(item):
    """A vertical list of every form button, built like the vanilla one."""
    return {
        "type": "stack_panel", "orientation": "vertical", "size": ["100%", "100%c"],
        "anchor_from": "top_left", "anchor_to": "top_left",
        "factory": {"name": "buttons", "control_ids": {
            "button": item, "label": "@server_form.dynamic_label", "header": "@server_form.dynamic_header",
            "divider": "@settings_common.option_group_section_divider"}},
        "collection_name": "form_buttons",
        "bindings": [{"binding_name": "#form_button_contents", "binding_name_override": "#collection_length"}],
    }


def scroll(content):
    return {
        "type": "panel", "size": ["100%", "100%"], "controls": [{"scroll@common.scrolling_panel": {
            "anchor_to": "top_left", "anchor_from": "top_left", "size": ["100% - 4px", "100% - 4px"], "offset": [2, 2],
            "$show_background": False, "$scrolling_content": content,
            "$scroll_size": [4, "100% - 4px"], "$scrolling_pane_size": ["100% - 2px", "100%"],
            "$scrolling_pane_offset": [0, 0], "$scroll_bar_right_padding_size": [0, 0],
        }}]}


def header():
    title = {
        "type": "label", "size": ["fill", "default"], "text": "#fc_title", "color": ACCENT, "shadow": True, "layer": 3,
        "font_type": "MinecraftTen", "font_scale_factor": 1.0,
        "bindings": [{"binding_name": "#title_text"},
                     {"binding_type": "view", "source_property_name": f"(#title_text - '{HUB}' - '{LIST}' - '{MODAL}' - '{BOARD}')", "target_property_name": "#fc_title"}],
    }
    close = {
        "size": [16, 16],
        "$pressed_button_name": "button.menu_exit",
        "default_control": "default", "hover_control": "hover", "pressed_control": "pressed",
        "controls": button_states("close", "close_hover", "close_hover"),
    }
    return image("header", ("100%", 22), controls=[{"row": {
        "type": "stack_panel", "orientation": "horizontal", "size": ["100% - 6px", 16], "layer": 2,
        "controls": [
            {"logo": image("logo", (16, 16), layer=3)},
            {"gap": pad(6, "100%")},
            {"title_box": {"type": "panel", "size": ["fill", "100%"], "controls": [{"title": title}]}},
            {"close@common.button": close},
        ]}}])


def body_text():
    return {"type": "stack_panel", "orientation": "vertical", "size": ["100%", "100%c"], "anchor_from": "top_left", "anchor_to": "top_left",
            "controls": [
                {"top": pad("100%", 4)},
                {"row": {"type": "stack_panel", "orientation": "horizontal", "size": ["100%", "100%c"], "controls": [
                    {"left": pad(5, 1)},
                    {"text": {"type": "label", "size": ["fill", "default"], "text": "#form_text", "color": TEXT, "shadow": True,
                              "bindings": [{"binding_name": "#form_text"}]}},
                ]}},
                {"bottom": pad("100%", 6)},
            ]}


def window(max_size, inner):
    return {
        "type": "panel", "size": ["100%", "100%"],
        "controls": [
            {"dim": image("dim", alpha=0.5, layer=0)},
            {"window": image("panel", ("100% - 16px", "100% - 12px"), max_size=max_size, layer=1, controls=[
                {"inner": {"type": "panel", "size": ["100% - 12px", "100% - 12px"], "layer": 1, "controls": inner}}])},
        ]}


def big_button(tex, hover, press, visible):
    """A full-width button with centred text (SELL NOW, CLAIM...)."""
    return {
        "size": ["100%", 24],
        "$pressed_button_name": "button.form_button_click",
        "default_control": "default", "hover_control": "hover", "pressed_control": "pressed",
        "controls": button_states(tex, hover, press) + [
            {"label": {"type": "label", "text": "#form_button_text", "color": [1, 1, 1], "shadow": True, "layer": 3,
                       "font_type": "MinecraftTen", "text_alignment": "center", "bindings": [coll("#form_button_text")]}},
        ],
        "bindings": [
            {"binding_type": "collection_details", "binding_collection_name": "form_buttons"},
            coll("#form_button_text"),
            {"binding_type": "view", "source_property_name": visible, "target_property_name": "#visible"},
        ],
    }


def board_pieces():
    """Pieces of the quest "board" layout."""
    is_action = has(ACTION, "#form_button_text")
    is_locked = has(LOCKED, "#form_button_text")
    return {
        # banner: the picture of the button marked BANNER
        "banner_item": {"type": "panel", "size": ["100%", 72], "controls": [
            {"frame": image("slot", ("100%", "100%"), controls=[{"img": {
                "type": "image", "size": ["100% - 4px", "100% - 4px"], "layer": 2,
                "bindings": [coll("#form_button_texture", "#texture"), coll("#form_button_texture_file_system", "#texture_file_system")]}}])}],
            "bindings": [coll("#form_button_text"), {"binding_type": "view", "source_property_name": has(BANNER, "#form_button_text"), "target_property_name": "#visible"}]},
        "banner_list": button_list("@fc_ui.banner_item"),
        # action buttons: green, or grey when locked
        "action_item": {"type": "panel", "size": ["100%", 27], "controls": [
            {"go@common.button": big_button("btn_green", "btn_green_hover", "btn_press", is_action)},
            {"locked@common.button": big_button("btn_locked", "btn_hover", "btn_press", is_locked)}],
            "bindings": [coll("#form_button_text"), {"binding_type": "view", "source_property_name": f"({is_action} or {is_locked})", "target_property_name": "#visible"}]},
        "action_list": button_list("@fc_ui.action_item"),
        # tiles: icon in a slot + up to 3 lines of text
        "tile_button@common.button": {
            "size": ["100% - 3px", "100% - 3px"],
            "$pressed_button_name": "button.form_button_click",
            "default_control": "default", "hover_control": "hover", "pressed_control": "pressed",
            "controls": button_states("card", "card_hover", "btn_press") + [
                {"content": {"type": "stack_panel", "orientation": "horizontal", "size": ["100%", "100%"], "layer": 2, "controls": [
                    {"pad_l": pad(4, "100%")},
                    {"slot": {"type": "panel", "size": [30, "100%"], "controls": [{"frame": image("slot", (30, 30), controls=[{"icon": icon_from_button(24)}])}]}},
                    {"pad_m": pad(5, "100%")},
                    {"text": {"type": "panel", "size": ["fill", "100%"], "controls": [{"lbl": {
                        "type": "label", "size": ["100%", "default"], "text": "#form_button_text", "color": TEXT, "shadow": True, "layer": 3,
                        "font_scale_factor": 0.8, "bindings": [coll("#form_button_text")]}}]}},
                ]}},
            ],
            "bindings": [
                {"binding_type": "collection_details", "binding_collection_name": "form_buttons"},
                coll("#form_button_text"),
                {"binding_type": "view", "source_property_name": has(TILE, "#form_button_text"), "target_property_name": "#visible"},
            ],
        },
        "tile_cell": {"type": "panel", "size": ["50%", 44], "controls": [{"tile@fc_ui.tile_button": {}}]},
        "tiles_grid": {"type": "grid", "size": ["100%", 308], "grid_dimensions": [2, 7], "grid_item_template": "fc_ui.tile_cell",
                       "grid_fill_direction": "horizontal", "collection_name": "form_buttons", "anchor_from": "top_left", "anchor_to": "top_left"},
        "tiles_padded": {"type": "stack_panel", "orientation": "vertical", "size": ["100%", "100%c"], "anchor_from": "top_left", "anchor_to": "top_left", "controls": [
            {"top": pad("100%", 3)},
            {"row": {"type": "stack_panel", "orientation": "horizontal", "size": ["100%", "100%c"], "controls": [
                {"l": pad(3, 1)}, {"grid@fc_ui.tiles_grid": {"size": ["fill", 308]}}]}}]},
        "board_form": {
            "type": "panel", "size": ["100%", "100%"],
            "bindings": [{"binding_name": "#title_text"}, {"binding_type": "view", "source_property_name": has(BOARD), "target_property_name": "#visible"}],
            "controls": [{"layout": window([520, 290], [{"rows": {"type": "stack_panel", "orientation": "vertical", "size": ["100%", "100%"], "controls": [
                {"header@fc_ui.header": {}},
                {"gap": pad("100%", 4)},
                {"cols": {"type": "stack_panel", "orientation": "horizontal", "size": ["100%", "fill"], "controls": [
                    {"left": {"type": "stack_panel", "orientation": "vertical", "size": ["35%", "100%"], "controls": [
                        {"banner@fc_ui.banner_list": {}},
                        {"gap1": pad("100%", 3)},
                        {"body": image("inner", ("100%", "fill"), controls=[{"scroll": scroll("fc_ui.body_text")}])},
                        {"gap2": pad("100%", 3)},
                        {"actions@fc_ui.action_list": {}},
                    ]}},
                    {"gap": pad(5, "100%")},
                    {"tiles": image("inner", ("fill", "100%"), controls=[{"scroll": scroll("fc_ui.tiles_padded")}])},
                ]}},
            ]}}])}],
        },
    }


def files():
    card_vis = has(CARD, "#form_button_text")
    rail_vis = lacks(CARD, var="#form_button_text")
    ns = {
        "namespace": "fc_ui",

        # ---------------- pieces
        "header": header(),
        "body_text": body_text(),
        "rail_button@common.button": form_button(28, "btn", "btn_hover", "btn_press", 22, rail_vis, True, 0.9),
        "list_button@common.button": form_button(30, "btn", "btn_hover", "btn_press", 24, rail_vis, True, 1.0),
        "rail_list": button_list("@fc_ui.rail_button"),
        "button_list": button_list("@fc_ui.list_button"),
        "card_cell": {"type": "panel", "size": ["25%", "50%"], "controls": [
            {"card@common.button": form_button("100% - 3px", "card", "card_hover", "btn_press", 16, card_vis, False, 0.75, "100% - 3px")}]},
        "cards_grid": {"type": "grid", "size": ["100%", 64], "grid_dimensions": [4, 2], "grid_item_template": "fc_ui.card_cell",
                       "grid_fill_direction": "horizontal", "collection_name": "form_buttons", "anchor_from": "top_left", "anchor_to": "top_left"},

        # ---------------- layouts
        "hub_form": {
            "type": "panel", "size": ["100%", "100%"],
            "bindings": [{"binding_name": "#title_text"}, {"binding_type": "view", "source_property_name": has(HUB), "target_property_name": "#visible"}],
            "controls": [{"layout": window([480, 280], [{"cols": {"type": "stack_panel", "orientation": "horizontal", "size": ["100%", "100%"], "controls": [
                {"left": {"type": "stack_panel", "orientation": "vertical", "size": ["33%", "100%"], "controls": [
                    {"logo_box": {"type": "panel", "size": ["100%", 60], "controls": [{"logo": image("logo", (58, 58))}]}},
                    {"gap": pad("100%", 3)},
                    {"rail": image("inner", ("100%", "fill"), controls=[{"scroll": scroll("fc_ui.rail_list_padded")}])},
                ]}},
                {"gap": pad(5, "100%")},
                {"right": {"type": "stack_panel", "orientation": "vertical", "size": ["fill", "100%"], "controls": [
                    {"header@fc_ui.header": {}},
                    {"gap1": pad("100%", 4)},
                    {"cards@fc_ui.cards_grid": {}},
                    {"gap2": pad("100%", 3)},
                    {"body": image("inner", ("100%", "fill"), controls=[{"scroll": scroll("fc_ui.body_text")}])},
                ]}},
            ]}}])}],
        },
        "list_form": {
            "type": "panel", "size": ["100%", "100%"],
            "bindings": [{"binding_name": "#title_text"}, {"binding_type": "view", "source_property_name": has(LIST), "target_property_name": "#visible"}],
            "controls": [{"layout": window([460, 270], [{"rows": {"type": "stack_panel", "orientation": "vertical", "size": ["100%", "100%"], "controls": [
                {"header@fc_ui.header": {}},
                {"gap": pad("100%", 4)},
                {"cols": {"type": "stack_panel", "orientation": "horizontal", "size": ["100%", "fill"], "controls": [
                    {"body": image("inner", ("45%", "100%"), controls=[{"scroll": scroll("fc_ui.body_text")}])},
                    {"gap": pad(5, "100%")},
                    {"buttons": image("inner", ("fill", "100%"), controls=[{"scroll": scroll("fc_ui.button_list_padded")}])},
                ]}},
            ]}}])}],
        },
        "button_list_padded": {"type": "stack_panel", "orientation": "vertical", "size": ["100%", "100%c"], "anchor_from": "top_left", "anchor_to": "top_left", "controls": [
            {"top": pad("100%", 3)},
            {"row": {"type": "stack_panel", "orientation": "horizontal", "size": ["100%", "100%c"], "controls": [
                {"l": pad(3, 1)}, {"list@fc_ui.button_list": {"size": ["fill", "100%c"]}}, {"r": pad(3, 1)}]}},
        ]},
        "rail_list_padded": {"type": "stack_panel", "orientation": "vertical", "size": ["100%", "100%c"], "controls": [
            {"top": pad("100%", 3)}, {"list@fc_ui.rail_list": {}}]},
        "modal_form": {
            "type": "panel", "size": ["100%", "100%"],
            "bindings": [{"binding_name": "#title_text"}, {"binding_type": "view", "source_property_name": has(MODAL), "target_property_name": "#visible"}],
            "controls": [{"layout": window([340, 260], [{"rows": {"type": "stack_panel", "orientation": "vertical", "size": ["100%", "100%"], "controls": [
                {"header@fc_ui.header": {}},
                {"gap": pad("100%", 4)},
                {"body": image("inner", ("100%", "fill"), controls=[{"scroll": scroll("server_form.custom_form_scrolling_content")}])},
            ]}}])}],
        },
        "long_root": {"type": "panel", "size": ["100%", "100%"], "controls": [{"hub@fc_ui.hub_form": {}}, {"list@fc_ui.list_form": {}}, {"board@fc_ui.board_form": {}}]},
        "custom_root": {"type": "panel", "size": ["100%", "100%"], "controls": [{"modal@fc_ui.modal_form": {}}]},

        # ---------------- HUD sidebar (keeps the last "fchud:" title)
        "hud_label": {
            "type": "label", "$update_string": HUD, "text": "#text", "color": [1, 1, 1], "shadow": True, "layer": 20,
            "font_scale_factor": 0.75, "size": ["default", "default"],
            "anchor_from": "right_middle", "anchor_to": "right_middle",
            "controls": [
                {"data_control": {
                    "type": "panel", "size": [0, 0],
                    "property_bag": {"#preserved_text": ""},
                    "bindings": [
                        {"binding_name": "#hud_title_text_string"},
                        {"binding_name": "#hud_title_text_string", "binding_name_override": "#preserved_text", "binding_condition": "visibility_changed"},
                        {"binding_type": "view", "source_property_name": "(not (#hud_title_text_string = #preserved_text) and not ((#hud_title_text_string - $update_string) = #hud_title_text_string))", "target_property_name": "#visible"},
                    ]}},
                {"bg": image("hud_panel", ("100% + 12px", "100% + 10px"), layer=-5, bindings=[
                    {"binding_type": "view", "source_control_name": "data_control", "resolve_sibling_scope": True,
                     "source_property_name": "(not ((#preserved_text - $update_string) = ''))", "target_property_name": "#visible"}])},
            ],
            "bindings": [{"binding_type": "view", "source_control_name": "data_control", "source_property_name": "(#preserved_text - $update_string)", "target_property_name": "#text"}],
        },
        "sidebar": {"type": "panel", "size": ["100%", "100%"], "layer": 20, "controls": [
            {"box": {"type": "panel", "size": ["100%c", "100%c"], "anchor_from": "right_middle", "anchor_to": "right_middle", "offset": [-8, -12],
                     "controls": [{"hud_label@fc_ui.hud_label": {}}]}}]},
    }

    ns.update(board_pieces())

    server_form = {
        "namespace": "server_form",
        "main_screen_content": {
            "size": ["100%", "100%"],
            "modifications": [{"array_name": "controls", "operation": "insert_back", "value": [
                {"fc_server_form_factory": {"type": "panel", "size": ["100%", "100%"], "factory": {
                    "name": "server_form_factory",
                    "control_ids": {"long_form": "@fc_ui.long_root", "custom_form": "@fc_ui.custom_root"}}}}]}],
        },
        "long_form": {"modifications": [{"array_name": "bindings", "operation": "insert_back", "value": [
            {"binding_name": "#title_text"},
            {"binding_type": "view", "source_property_name": lacks(HUB, LIST, BOARD), "target_property_name": "#visible"}]}]},
        "custom_form": {"modifications": [{"array_name": "bindings", "operation": "insert_back", "value": [
            {"binding_name": "#title_text"},
            {"binding_type": "view", "source_property_name": lacks(MODAL), "target_property_name": "#visible"}]}]},
    }

    hud = {
        "namespace": "hud",
        "root_panel": {"modifications": [{"array_name": "controls", "operation": "insert_back", "value": [{"fc_sidebar@fc_ui.sidebar": {}}]}]},
        # Our HUD titles are data, not something to show in the middle of the screen.
        "hud_title_text": {"bindings": [
            {"binding_name": "#hud_title_text_string"},
            {"binding_type": "view", "source_property_name": lacks(HUD, var="#hud_title_text_string"), "target_property_name": "#visible"}]},
    }

    return {"fc_ui.json": ns, "server_form.json": server_form, "hud_screen.json": hud, "_ui_defs.json": {"ui_defs": ["ui/fc_ui.json"]}}
