(function(){
    'use strict';
    var catalog={
  "categories": [
    {
      "id": "weapon",
      "label": "武器与装备"
    },
    {
      "id": "item",
      "label": "道具与材料"
    },
    {
      "id": "technology",
      "label": "科技与服务"
    },
    {
      "id": "challenge",
      "label": "挑战商店"
    },
    {
      "id": "rebirth",
      "label": "转职挑战"
    },
    {
      "id": "bundles",
      "label": "礼包"
    }
  ],
  "products": [
    {
      "id": "preview_weapon_0",
      "item_id": "lottery_attribute_crystal",
      "category": "weapon",
      "name": "属性结晶",
      "image": "file://{images}/custom_game/archive_items_v2/lottery_attribute_crystal.png",
      "effect": "模拟效果：提升攻击速度，持续60秒。仅用于界面展示，不实际生效。",
      "prices": [
        {
          "amount": 120,
          "currencyName": "积分"
        }
      ],
      "state": "normal",
      "purchasable": true,
      "min_quantity": 1,
      "max_quantity": 9
    },
    {
      "id": "preview_weapon_1",
      "item_id": "shop_weapon_growth_sword_01",
      "category": "weapon",
      "name": "成长之剑 · 长名称展示测试",
      "image": "file://{images}/custom_game/archive_items_v2/shop_weapon_growth_sword_01.png",
      "effect": "模拟效果：提升资源获取，持续60秒。仅用于界面展示，不实际生效。这是一段较长的模拟效果说明，用于检查悬停层内换行和滚动，购买不会改变角色属性或背包。",
      "prices": [
        {
          "amount": 12,
          "currencyName": "U币"
        }
      ],
      "state": "normal",
      "purchasable": true,
      "min_quantity": 1,
      "max_quantity": 9
    },
    {
      "id": "preview_weapon_2",
      "item_id": "lottery_nature_crystal",
      "category": "weapon",
      "name": "自然结晶",
      "image": "file://{images}/custom_game/archive_items_v2/lottery_nature_crystal.png",
      "effect": "模拟效果：提升生命恢复，持续60秒。仅用于界面展示，不实际生效。",
      "prices": [
        {
          "amount": 360,
          "currencyName": "积分"
        }
      ],
      "state": "owned",
      "purchasable": false,
      "min_quantity": 1,
      "max_quantity": 9
    },
    {
      "id": "preview_weapon_3",
      "item_id": "fragment_03",
      "category": "weapon",
      "name": "神兵-焚焰",
      "image": "file://{images}/custom_game/archive_items_v2/fragment_03.png",
      "effect": "模拟效果：提升护甲，持续60秒。仅用于界面展示，不实际生效。",
      "prices": [
        {
          "amount": 24,
          "currencyName": "U币"
        }
      ],
      "state": "soldout",
      "purchasable": false,
      "min_quantity": 1,
      "max_quantity": 9
    },
    {
      "id": "preview_weapon_4",
      "item_id": "shop_equipment_attack_gloves_01",
      "category": "weapon",
      "name": "加速手套LV1",
      "image": "file://{images}/custom_game/archive_items_v2/shop_equipment_attack_gloves_01.png",
      "effect": "模拟效果：提升攻击速度，持续60秒。仅用于界面展示，不实际生效。",
      "prices": [
        {
          "amount": 600,
          "currencyName": "积分"
        }
      ],
      "state": "normal",
      "purchasable": true,
      "min_quantity": 1,
      "max_quantity": 9
    },
    {
      "id": "preview_weapon_5",
      "item_id": "lottery_recovery_crystal",
      "category": "weapon",
      "name": "回复结晶",
      "image": "file://{images}/custom_game/archive_items_v2/lottery_recovery_crystal.png",
      "effect": "模拟效果：提升资源获取，持续60秒。仅用于界面展示，不实际生效。",
      "prices": [
        {
          "amount": 36,
          "currencyName": "U币"
        }
      ],
      "state": "normal",
      "purchasable": true,
      "min_quantity": 1,
      "max_quantity": 9
    },
    {
      "id": "preview_weapon_6",
      "item_id": "lottery_expansion_crystal",
      "category": "weapon",
      "name": "膨胀结晶",
      "image": "file://{images}/custom_game/archive_items_v2/lottery_expansion_crystal.png",
      "effect": "模拟效果：提升生命恢复，持续60秒。仅用于界面展示，不实际生效。",
      "prices": [
        {
          "amount": 840,
          "currencyName": "积分"
        }
      ],
      "state": "normal",
      "purchasable": true,
      "min_quantity": 1,
      "max_quantity": 9
    },
    {
      "id": "preview_weapon_7",
      "item_id": "fragment_04",
      "category": "weapon",
      "name": "神兵-净魂之刃",
      "image": "file://{images}/custom_game/archive_items_v2/fragment_04.png",
      "effect": "模拟效果：提升护甲，持续60秒。仅用于界面展示，不实际生效。",
      "prices": [
        {
          "amount": 48,
          "currencyName": "U币"
        }
      ],
      "state": "normal",
      "purchasable": true,
      "min_quantity": 1,
      "max_quantity": 9
    },
    {
      "id": "preview_item_0",
      "item_id": "shop_equipment_attack_gloves_01",
      "category": "item",
      "name": "加速手套LV1",
      "image": "file://{images}/custom_game/archive_items_v2/shop_equipment_attack_gloves_01.png",
      "effect": "模拟效果：提升攻击速度，持续60秒。仅用于界面展示，不实际生效。",
      "prices": [
        {
          "amount": 120,
          "currencyName": "积分"
        }
      ],
      "state": "normal",
      "purchasable": true,
      "min_quantity": 1,
      "max_quantity": 9
    },
    {
      "id": "preview_item_1",
      "item_id": "lottery_recovery_crystal",
      "category": "item",
      "name": "回复结晶 · 长名称展示测试",
      "image": "file://{images}/custom_game/archive_items_v2/lottery_recovery_crystal.png",
      "effect": "模拟效果：提升资源获取，持续60秒。仅用于界面展示，不实际生效。这是一段较长的模拟效果说明，用于检查悬停层内换行和滚动，购买不会改变角色属性或背包。",
      "prices": [
        {
          "amount": 12,
          "currencyName": "U币"
        }
      ],
      "state": "normal",
      "purchasable": true,
      "min_quantity": 1,
      "max_quantity": 9
    },
    {
      "id": "preview_item_2",
      "item_id": "lottery_expansion_crystal",
      "category": "item",
      "name": "膨胀结晶",
      "image": "file://{images}/custom_game/archive_items_v2/lottery_expansion_crystal.png",
      "effect": "模拟效果：提升生命恢复，持续60秒。仅用于界面展示，不实际生效。",
      "prices": [
        {
          "amount": 360,
          "currencyName": "积分"
        }
      ],
      "state": "owned",
      "purchasable": false,
      "min_quantity": 1,
      "max_quantity": 9
    },
    {
      "id": "preview_item_3",
      "item_id": "fragment_04",
      "category": "item",
      "name": "神兵-净魂之刃",
      "image": "file://{images}/custom_game/archive_items_v2/fragment_04.png",
      "effect": "模拟效果：提升护甲，持续60秒。仅用于界面展示，不实际生效。",
      "prices": [
        {
          "amount": 24,
          "currencyName": "U币"
        }
      ],
      "state": "soldout",
      "purchasable": false,
      "min_quantity": 1,
      "max_quantity": 9
    },
    {
      "id": "preview_item_4",
      "item_id": "fragment_06",
      "category": "item",
      "name": "神兵-碎颅锤",
      "image": "file://{images}/custom_game/archive_items_v2/fragment_06.png",
      "effect": "模拟效果：提升攻击速度，持续60秒。仅用于界面展示，不实际生效。",
      "prices": [
        {
          "amount": 600,
          "currencyName": "积分"
        }
      ],
      "state": "normal",
      "purchasable": true,
      "min_quantity": 1,
      "max_quantity": 9
    },
    {
      "id": "preview_item_5",
      "item_id": "shop_equipment_burning_blade_01",
      "category": "item",
      "name": "灼热之刃LV1",
      "image": "file://{images}/custom_game/archive_items_v2/shop_equipment_burning_blade_01.png",
      "effect": "模拟效果：提升资源获取，持续60秒。仅用于界面展示，不实际生效。",
      "prices": [
        {
          "amount": 36,
          "currencyName": "U币"
        }
      ],
      "state": "normal",
      "purchasable": true,
      "min_quantity": 1,
      "max_quantity": 9
    },
    {
      "id": "preview_item_6",
      "item_id": "shop_item_death_mask",
      "category": "item",
      "name": "死亡面罩",
      "image": "file://{images}/custom_game/archive_items_v2/shop_item_death_mask.png",
      "effect": "模拟效果：提升生命恢复，持续60秒。仅用于界面展示，不实际生效。",
      "prices": [
        {
          "amount": 840,
          "currencyName": "积分"
        }
      ],
      "state": "normal",
      "purchasable": true,
      "min_quantity": 1,
      "max_quantity": 9
    },
    {
      "id": "preview_item_7",
      "item_id": "lottery_wealth_crystal",
      "category": "item",
      "name": "财富结晶",
      "image": "file://{images}/custom_game/archive_items_v2/lottery_wealth_crystal.png",
      "effect": "模拟效果：提升护甲，持续60秒。仅用于界面展示，不实际生效。",
      "prices": [
        {
          "amount": 48,
          "currencyName": "U币"
        }
      ],
      "state": "normal",
      "purchasable": true,
      "min_quantity": 1,
      "max_quantity": 9
    },
    {
      "id": "preview_technology_0",
      "item_id": "fragment_06",
      "category": "technology",
      "name": "神兵-碎颅锤",
      "image": "file://{images}/custom_game/archive_items_v2/fragment_06.png",
      "effect": "模拟效果：提升攻击速度，持续60秒。仅用于界面展示，不实际生效。",
      "prices": [
        {
          "amount": 120,
          "currencyName": "积分"
        }
      ],
      "state": "normal",
      "purchasable": true,
      "min_quantity": 1,
      "max_quantity": 9
    },
    {
      "id": "preview_technology_1",
      "item_id": "shop_equipment_burning_blade_01",
      "category": "technology",
      "name": "灼热之刃LV1 · 长名称展示测试",
      "image": "file://{images}/custom_game/archive_items_v2/shop_equipment_burning_blade_01.png",
      "effect": "模拟效果：提升资源获取，持续60秒。仅用于界面展示，不实际生效。这是一段较长的模拟效果说明，用于检查悬停层内换行和滚动，购买不会改变角色属性或背包。",
      "prices": [
        {
          "amount": 12,
          "currencyName": "U币"
        }
      ],
      "state": "normal",
      "purchasable": true,
      "min_quantity": 1,
      "max_quantity": 9
    },
    {
      "id": "preview_technology_2",
      "item_id": "shop_item_death_mask",
      "category": "technology",
      "name": "死亡面罩",
      "image": "file://{images}/custom_game/archive_items_v2/shop_item_death_mask.png",
      "effect": "模拟效果：提升生命恢复，持续60秒。仅用于界面展示，不实际生效。",
      "prices": [
        {
          "amount": 360,
          "currencyName": "积分"
        }
      ],
      "state": "owned",
      "purchasable": false,
      "min_quantity": 1,
      "max_quantity": 9
    },
    {
      "id": "preview_technology_3",
      "item_id": "lottery_wealth_crystal",
      "category": "technology",
      "name": "财富结晶",
      "image": "file://{images}/custom_game/archive_items_v2/lottery_wealth_crystal.png",
      "effect": "模拟效果：提升护甲，持续60秒。仅用于界面展示，不实际生效。",
      "prices": [
        {
          "amount": 24,
          "currencyName": "U币"
        }
      ],
      "state": "soldout",
      "purchasable": false,
      "min_quantity": 1,
      "max_quantity": 9
    },
    {
      "id": "preview_technology_4",
      "item_id": "lottery_recovery_spirit",
      "category": "technology",
      "name": "回复精神",
      "image": "file://{images}/custom_game/archive_items_v2/lottery_recovery_spirit.png",
      "effect": "模拟效果：提升攻击速度，持续60秒。仅用于界面展示，不实际生效。",
      "prices": [
        {
          "amount": 600,
          "currencyName": "积分"
        }
      ],
      "state": "normal",
      "purchasable": true,
      "min_quantity": 1,
      "max_quantity": 9
    },
    {
      "id": "preview_technology_5",
      "item_id": "fragment_08",
      "category": "technology",
      "name": "神兵-龙爪弯钩",
      "image": "file://{images}/custom_game/archive_items_v2/fragment_08.png",
      "effect": "模拟效果：提升资源获取，持续60秒。仅用于界面展示，不实际生效。",
      "prices": [
        {
          "amount": 36,
          "currencyName": "U币"
        }
      ],
      "state": "normal",
      "purchasable": true,
      "min_quantity": 1,
      "max_quantity": 9
    },
    {
      "id": "preview_technology_6",
      "item_id": "fragment_10",
      "category": "technology",
      "name": "神兵-战鬼双刃",
      "image": "file://{images}/custom_game/archive_items_v2/fragment_10.png",
      "effect": "模拟效果：提升生命恢复，持续60秒。仅用于界面展示，不实际生效。",
      "prices": [
        {
          "amount": 840,
          "currencyName": "积分"
        }
      ],
      "state": "normal",
      "purchasable": true,
      "min_quantity": 1,
      "max_quantity": 9
    },
    {
      "id": "preview_technology_7",
      "item_id": "fragment_12",
      "category": "technology",
      "name": "神兵-魔导师密钥",
      "image": "file://{images}/custom_game/archive_items_v2/fragment_12.png",
      "effect": "模拟效果：提升护甲，持续60秒。仅用于界面展示，不实际生效。",
      "prices": [
        {
          "amount": 48,
          "currencyName": "U币"
        }
      ],
      "state": "normal",
      "purchasable": true,
      "min_quantity": 1,
      "max_quantity": 9
    },
    {
      "id": "preview_challenge_0",
      "item_id": "lottery_recovery_spirit",
      "category": "challenge",
      "name": "回复精神",
      "image": "file://{images}/custom_game/archive_items_v2/lottery_recovery_spirit.png",
      "effect": "模拟效果：提升攻击速度，持续60秒。仅用于界面展示，不实际生效。",
      "prices": [
        {
          "amount": 120,
          "currencyName": "积分"
        }
      ],
      "state": "normal",
      "purchasable": true,
      "min_quantity": 1,
      "max_quantity": 9
    },
    {
      "id": "preview_challenge_1",
      "item_id": "fragment_08",
      "category": "challenge",
      "name": "神兵-龙爪弯钩 · 长名称展示测试",
      "image": "file://{images}/custom_game/archive_items_v2/fragment_08.png",
      "effect": "模拟效果：提升资源获取，持续60秒。仅用于界面展示，不实际生效。这是一段较长的模拟效果说明，用于检查悬停层内换行和滚动，购买不会改变角色属性或背包。",
      "prices": [
        {
          "amount": 12,
          "currencyName": "U币"
        }
      ],
      "state": "normal",
      "purchasable": true,
      "min_quantity": 1,
      "max_quantity": 9
    },
    {
      "id": "preview_challenge_2",
      "item_id": "fragment_10",
      "category": "challenge",
      "name": "神兵-战鬼双刃",
      "image": "file://{images}/custom_game/archive_items_v2/fragment_10.png",
      "effect": "模拟效果：提升生命恢复，持续60秒。仅用于界面展示，不实际生效。",
      "prices": [
        {
          "amount": 360,
          "currencyName": "积分"
        }
      ],
      "state": "owned",
      "purchasable": false,
      "min_quantity": 1,
      "max_quantity": 9
    },
    {
      "id": "preview_challenge_3",
      "item_id": "fragment_12",
      "category": "challenge",
      "name": "神兵-魔导师密钥",
      "image": "file://{images}/custom_game/archive_items_v2/fragment_12.png",
      "effect": "模拟效果：提升护甲，持续60秒。仅用于界面展示，不实际生效。",
      "prices": [
        {
          "amount": 24,
          "currencyName": "U币"
        }
      ],
      "state": "soldout",
      "purchasable": false,
      "min_quantity": 1,
      "max_quantity": 9
    },
    {
      "id": "preview_challenge_4",
      "item_id": "shop_item_super_knowledge_book",
      "category": "challenge",
      "name": "超级知识之书",
      "image": "file://{images}/custom_game/archive_items_v2/shop_item_super_knowledge_book.png",
      "effect": "模拟效果：提升攻击速度，持续60秒。仅用于界面展示，不实际生效。",
      "prices": [
        {
          "amount": 600,
          "currencyName": "积分"
        }
      ],
      "state": "normal",
      "purchasable": true,
      "min_quantity": 1,
      "max_quantity": 9
    },
    {
      "id": "preview_challenge_5",
      "item_id": "lottery_nature_spirit",
      "category": "challenge",
      "name": "自然精神",
      "image": "file://{images}/custom_game/archive_items_v2/lottery_nature_spirit.png",
      "effect": "模拟效果：提升资源获取，持续60秒。仅用于界面展示，不实际生效。",
      "prices": [
        {
          "amount": 36,
          "currencyName": "U币"
        }
      ],
      "state": "normal",
      "purchasable": true,
      "min_quantity": 1,
      "max_quantity": 9
    },
    {
      "id": "preview_challenge_6",
      "item_id": "lottery_divine_spirit",
      "category": "challenge",
      "name": "神赐精神",
      "image": "file://{images}/custom_game/archive_items_v2/lottery_divine_spirit.png",
      "effect": "模拟效果：提升生命恢复，持续60秒。仅用于界面展示，不实际生效。",
      "prices": [
        {
          "amount": 840,
          "currencyName": "积分"
        }
      ],
      "state": "normal",
      "purchasable": true,
      "min_quantity": 1,
      "max_quantity": 9
    },
    {
      "id": "preview_challenge_7",
      "item_id": "lottery_gale_bow",
      "category": "challenge",
      "name": "疾风弓",
      "image": "file://{images}/custom_game/archive_items_v2/lottery_gale_bow.png",
      "effect": "模拟效果：提升护甲，持续60秒。仅用于界面展示，不实际生效。",
      "prices": [
        {
          "amount": 48,
          "currencyName": "U币"
        }
      ],
      "state": "normal",
      "purchasable": true,
      "min_quantity": 1,
      "max_quantity": 9
    },
    {
      "id": "preview_rebirth_0",
      "item_id": "shop_item_super_knowledge_book",
      "category": "rebirth",
      "name": "超级知识之书",
      "image": "file://{images}/custom_game/archive_items_v2/shop_item_super_knowledge_book.png",
      "effect": "模拟效果：提升攻击速度，持续60秒。仅用于界面展示，不实际生效。",
      "prices": [
        {
          "amount": 120,
          "currencyName": "积分"
        }
      ],
      "state": "normal",
      "purchasable": true,
      "min_quantity": 1,
      "max_quantity": 9
    },
    {
      "id": "preview_rebirth_1",
      "item_id": "lottery_nature_spirit",
      "category": "rebirth",
      "name": "自然精神 · 长名称展示测试",
      "image": "file://{images}/custom_game/archive_items_v2/lottery_nature_spirit.png",
      "effect": "模拟效果：提升资源获取，持续60秒。仅用于界面展示，不实际生效。这是一段较长的模拟效果说明，用于检查悬停层内换行和滚动，购买不会改变角色属性或背包。",
      "prices": [
        {
          "amount": 12,
          "currencyName": "U币"
        }
      ],
      "state": "normal",
      "purchasable": true,
      "min_quantity": 1,
      "max_quantity": 9
    },
    {
      "id": "preview_rebirth_2",
      "item_id": "lottery_divine_spirit",
      "category": "rebirth",
      "name": "神赐精神",
      "image": "file://{images}/custom_game/archive_items_v2/lottery_divine_spirit.png",
      "effect": "模拟效果：提升生命恢复，持续60秒。仅用于界面展示，不实际生效。",
      "prices": [
        {
          "amount": 360,
          "currencyName": "积分"
        }
      ],
      "state": "owned",
      "purchasable": false,
      "min_quantity": 1,
      "max_quantity": 9
    },
    {
      "id": "preview_rebirth_3",
      "item_id": "lottery_gale_bow",
      "category": "rebirth",
      "name": "疾风弓",
      "image": "file://{images}/custom_game/archive_items_v2/lottery_gale_bow.png",
      "effect": "模拟效果：提升护甲，持续60秒。仅用于界面展示，不实际生效。",
      "prices": [
        {
          "amount": 24,
          "currencyName": "U币"
        }
      ],
      "state": "soldout",
      "purchasable": false,
      "min_quantity": 1,
      "max_quantity": 9
    },
    {
      "id": "preview_rebirth_4",
      "item_id": "lottery_quick_dry_cement",
      "category": "rebirth",
      "name": "速干水泥",
      "image": "file://{images}/custom_game/archive_items_v2/lottery_quick_dry_cement.png",
      "effect": "模拟效果：提升攻击速度，持续60秒。仅用于界面展示，不实际生效。",
      "prices": [
        {
          "amount": 600,
          "currencyName": "积分"
        }
      ],
      "state": "normal",
      "purchasable": true,
      "min_quantity": 1,
      "max_quantity": 9
    },
    {
      "id": "preview_rebirth_5",
      "item_id": "lottery_hippogryph_onslaught",
      "category": "rebirth",
      "name": "角鹰魔攻",
      "image": "file://{images}/custom_game/archive_items_v2/lottery_hippogryph_onslaught.png",
      "effect": "模拟效果：提升资源获取，持续60秒。仅用于界面展示，不实际生效。",
      "prices": [
        {
          "amount": 36,
          "currencyName": "U币"
        }
      ],
      "state": "normal",
      "purchasable": true,
      "min_quantity": 1,
      "max_quantity": 9
    },
    {
      "id": "preview_rebirth_6",
      "item_id": "lottery_tower_retrofit",
      "category": "rebirth",
      "name": "箭塔改造",
      "image": "file://{images}/custom_game/archive_items_v2/lottery_tower_retrofit.png",
      "effect": "模拟效果：提升生命恢复，持续60秒。仅用于界面展示，不实际生效。",
      "prices": [
        {
          "amount": 840,
          "currencyName": "积分"
        }
      ],
      "state": "normal",
      "purchasable": true,
      "min_quantity": 1,
      "max_quantity": 9
    },
    {
      "id": "preview_rebirth_7",
      "item_id": "lottery_gathering_grimoire",
      "category": "rebirth",
      "name": "采集秘典",
      "image": "file://{images}/custom_game/archive_items_v2/lottery_gathering_grimoire.png",
      "effect": "模拟效果：提升护甲，持续60秒。仅用于界面展示，不实际生效。",
      "prices": [
        {
          "amount": 48,
          "currencyName": "U币"
        }
      ],
      "state": "normal",
      "purchasable": true,
      "min_quantity": 1,
      "max_quantity": 9
    }
  ],
  "bundles": [
    {
      "id": "preview_bundle_0",
      "category": "bundles",
      "name": "启程礼包",
      "effect": "演示礼包，仅展示组合内容与模拟金额。",
      "prices": [
        {
          "amount": 36,
          "currencyName": "U币"
        }
      ],
      "state": "normal",
      "purchasable": true,
      "min_quantity": 1,
      "max_quantity": 5,
      "items": [
        {
          "id": "preview_weapon_0",
          "item_id": "lottery_attribute_crystal",
          "category": "weapon",
          "name": "属性结晶",
          "image": "file://{images}/custom_game/archive_items_v2/lottery_attribute_crystal.png",
          "effect": "模拟效果：提升攻击速度，持续60秒。仅用于界面展示，不实际生效。",
          "prices": [
            {
              "amount": 120,
              "currencyName": "积分"
            }
          ],
          "state": "normal",
          "purchasable": true,
          "min_quantity": 1,
          "max_quantity": 9,
          "quantity": 1
        },
        {
          "id": "preview_weapon_1",
          "item_id": "shop_weapon_growth_sword_01",
          "category": "weapon",
          "name": "成长之剑 · 长名称展示测试",
          "image": "file://{images}/custom_game/archive_items_v2/shop_weapon_growth_sword_01.png",
          "effect": "模拟效果：提升资源获取，持续60秒。仅用于界面展示，不实际生效。这是一段较长的模拟效果说明，用于检查悬停层内换行和滚动，购买不会改变角色属性或背包。",
          "prices": [
            {
              "amount": 12,
              "currencyName": "U币"
            }
          ],
          "state": "normal",
          "purchasable": true,
          "min_quantity": 1,
          "max_quantity": 9,
          "quantity": 2
        },
        {
          "id": "preview_weapon_2",
          "item_id": "lottery_nature_crystal",
          "category": "weapon",
          "name": "自然结晶",
          "image": "file://{images}/custom_game/archive_items_v2/lottery_nature_crystal.png",
          "effect": "模拟效果：提升生命恢复，持续60秒。仅用于界面展示，不实际生效。",
          "prices": [
            {
              "amount": 360,
              "currencyName": "积分"
            }
          ],
          "state": "owned",
          "purchasable": false,
          "min_quantity": 1,
          "max_quantity": 9,
          "quantity": 3
        },
        {
          "id": "preview_weapon_3",
          "item_id": "fragment_03",
          "category": "weapon",
          "name": "神兵-焚焰",
          "image": "file://{images}/custom_game/archive_items_v2/fragment_03.png",
          "effect": "模拟效果：提升护甲，持续60秒。仅用于界面展示，不实际生效。",
          "prices": [
            {
              "amount": 24,
              "currencyName": "U币"
            }
          ],
          "state": "soldout",
          "purchasable": false,
          "min_quantity": 1,
          "max_quantity": 9,
          "quantity": 4
        }
      ],
      "image": "file://{images}/custom_game/archive_items_v2/lottery_attribute_crystal.png"
    },
    {
      "id": "preview_bundle_1",
      "category": "bundles",
      "name": "成长礼包",
      "effect": "演示礼包，仅展示组合内容与模拟金额。",
      "prices": [
        {
          "amount": 72,
          "currencyName": "U币"
        }
      ],
      "state": "normal",
      "purchasable": true,
      "min_quantity": 1,
      "max_quantity": 5,
      "items": [
        {
          "id": "preview_weapon_1",
          "item_id": "shop_weapon_growth_sword_01",
          "category": "weapon",
          "name": "成长之剑 · 长名称展示测试",
          "image": "file://{images}/custom_game/archive_items_v2/shop_weapon_growth_sword_01.png",
          "effect": "模拟效果：提升资源获取，持续60秒。仅用于界面展示，不实际生效。这是一段较长的模拟效果说明，用于检查悬停层内换行和滚动，购买不会改变角色属性或背包。",
          "prices": [
            {
              "amount": 12,
              "currencyName": "U币"
            }
          ],
          "state": "normal",
          "purchasable": true,
          "min_quantity": 1,
          "max_quantity": 9,
          "quantity": 1
        },
        {
          "id": "preview_weapon_2",
          "item_id": "lottery_nature_crystal",
          "category": "weapon",
          "name": "自然结晶",
          "image": "file://{images}/custom_game/archive_items_v2/lottery_nature_crystal.png",
          "effect": "模拟效果：提升生命恢复，持续60秒。仅用于界面展示，不实际生效。",
          "prices": [
            {
              "amount": 360,
              "currencyName": "积分"
            }
          ],
          "state": "owned",
          "purchasable": false,
          "min_quantity": 1,
          "max_quantity": 9,
          "quantity": 2
        },
        {
          "id": "preview_weapon_3",
          "item_id": "fragment_03",
          "category": "weapon",
          "name": "神兵-焚焰",
          "image": "file://{images}/custom_game/archive_items_v2/fragment_03.png",
          "effect": "模拟效果：提升护甲，持续60秒。仅用于界面展示，不实际生效。",
          "prices": [
            {
              "amount": 24,
              "currencyName": "U币"
            }
          ],
          "state": "soldout",
          "purchasable": false,
          "min_quantity": 1,
          "max_quantity": 9,
          "quantity": 3
        },
        {
          "id": "preview_weapon_4",
          "item_id": "shop_equipment_attack_gloves_01",
          "category": "weapon",
          "name": "加速手套LV1",
          "image": "file://{images}/custom_game/archive_items_v2/shop_equipment_attack_gloves_01.png",
          "effect": "模拟效果：提升攻击速度，持续60秒。仅用于界面展示，不实际生效。",
          "prices": [
            {
              "amount": 600,
              "currencyName": "积分"
            }
          ],
          "state": "normal",
          "purchasable": true,
          "min_quantity": 1,
          "max_quantity": 9,
          "quantity": 4
        }
      ],
      "image": "file://{images}/custom_game/archive_items_v2/shop_weapon_growth_sword_01.png"
    },
    {
      "id": "preview_bundle_2",
      "category": "bundles",
      "name": "勇者礼包",
      "effect": "演示礼包，仅展示组合内容与模拟金额。",
      "prices": [
        {
          "amount": 108,
          "currencyName": "U币"
        }
      ],
      "state": "normal",
      "purchasable": true,
      "min_quantity": 1,
      "max_quantity": 5,
      "items": [
        {
          "id": "preview_weapon_2",
          "item_id": "lottery_nature_crystal",
          "category": "weapon",
          "name": "自然结晶",
          "image": "file://{images}/custom_game/archive_items_v2/lottery_nature_crystal.png",
          "effect": "模拟效果：提升生命恢复，持续60秒。仅用于界面展示，不实际生效。",
          "prices": [
            {
              "amount": 360,
              "currencyName": "积分"
            }
          ],
          "state": "owned",
          "purchasable": false,
          "min_quantity": 1,
          "max_quantity": 9,
          "quantity": 1
        },
        {
          "id": "preview_weapon_3",
          "item_id": "fragment_03",
          "category": "weapon",
          "name": "神兵-焚焰",
          "image": "file://{images}/custom_game/archive_items_v2/fragment_03.png",
          "effect": "模拟效果：提升护甲，持续60秒。仅用于界面展示，不实际生效。",
          "prices": [
            {
              "amount": 24,
              "currencyName": "U币"
            }
          ],
          "state": "soldout",
          "purchasable": false,
          "min_quantity": 1,
          "max_quantity": 9,
          "quantity": 2
        },
        {
          "id": "preview_weapon_4",
          "item_id": "shop_equipment_attack_gloves_01",
          "category": "weapon",
          "name": "加速手套LV1",
          "image": "file://{images}/custom_game/archive_items_v2/shop_equipment_attack_gloves_01.png",
          "effect": "模拟效果：提升攻击速度，持续60秒。仅用于界面展示，不实际生效。",
          "prices": [
            {
              "amount": 600,
              "currencyName": "积分"
            }
          ],
          "state": "normal",
          "purchasable": true,
          "min_quantity": 1,
          "max_quantity": 9,
          "quantity": 3
        },
        {
          "id": "preview_weapon_5",
          "item_id": "lottery_recovery_crystal",
          "category": "weapon",
          "name": "回复结晶",
          "image": "file://{images}/custom_game/archive_items_v2/lottery_recovery_crystal.png",
          "effect": "模拟效果：提升资源获取，持续60秒。仅用于界面展示，不实际生效。",
          "prices": [
            {
              "amount": 36,
              "currencyName": "U币"
            }
          ],
          "state": "normal",
          "purchasable": true,
          "min_quantity": 1,
          "max_quantity": 9,
          "quantity": 4
        }
      ],
      "image": "file://{images}/custom_game/archive_items_v2/lottery_nature_crystal.png"
    },
    {
      "id": "preview_bundle_3",
      "category": "bundles",
      "name": "典藏礼包",
      "effect": "演示礼包，仅展示组合内容与模拟金额。",
      "prices": [
        {
          "amount": 144,
          "currencyName": "U币"
        }
      ],
      "state": "normal",
      "purchasable": true,
      "min_quantity": 1,
      "max_quantity": 5,
      "items": [
        {
          "id": "preview_weapon_3",
          "item_id": "fragment_03",
          "category": "weapon",
          "name": "神兵-焚焰",
          "image": "file://{images}/custom_game/archive_items_v2/fragment_03.png",
          "effect": "模拟效果：提升护甲，持续60秒。仅用于界面展示，不实际生效。",
          "prices": [
            {
              "amount": 24,
              "currencyName": "U币"
            }
          ],
          "state": "soldout",
          "purchasable": false,
          "min_quantity": 1,
          "max_quantity": 9,
          "quantity": 1
        },
        {
          "id": "preview_weapon_4",
          "item_id": "shop_equipment_attack_gloves_01",
          "category": "weapon",
          "name": "加速手套LV1",
          "image": "file://{images}/custom_game/archive_items_v2/shop_equipment_attack_gloves_01.png",
          "effect": "模拟效果：提升攻击速度，持续60秒。仅用于界面展示，不实际生效。",
          "prices": [
            {
              "amount": 600,
              "currencyName": "积分"
            }
          ],
          "state": "normal",
          "purchasable": true,
          "min_quantity": 1,
          "max_quantity": 9,
          "quantity": 2
        },
        {
          "id": "preview_weapon_5",
          "item_id": "lottery_recovery_crystal",
          "category": "weapon",
          "name": "回复结晶",
          "image": "file://{images}/custom_game/archive_items_v2/lottery_recovery_crystal.png",
          "effect": "模拟效果：提升资源获取，持续60秒。仅用于界面展示，不实际生效。",
          "prices": [
            {
              "amount": 36,
              "currencyName": "U币"
            }
          ],
          "state": "normal",
          "purchasable": true,
          "min_quantity": 1,
          "max_quantity": 9,
          "quantity": 3
        },
        {
          "id": "preview_weapon_6",
          "item_id": "lottery_expansion_crystal",
          "category": "weapon",
          "name": "膨胀结晶",
          "image": "file://{images}/custom_game/archive_items_v2/lottery_expansion_crystal.png",
          "effect": "模拟效果：提升生命恢复，持续60秒。仅用于界面展示，不实际生效。",
          "prices": [
            {
              "amount": 840,
              "currencyName": "积分"
            }
          ],
          "state": "normal",
          "purchasable": true,
          "min_quantity": 1,
          "max_quantity": 9,
          "quantity": 4
        }
      ],
      "image": "file://{images}/custom_game/archive_items_v2/fragment_03.png"
    }
  ]
},serial=0;
    // Local-only provider. No HTTP, game events, wallet or entitlement operations.
    GameUI.CustomUIConfig().SurvivalCommercePreviewData={
        catalog:catalog,
        methods:[{id:'preview_scan_a',name:'微信（模拟）'},{id:'preview_scan_b',name:'支付宝（模拟）'}],
        qr:'file://{images}/custom_game/shop_preview_v1/preview_qr.png',
        createOrder:function(product,quantity,method){
            return {id:'UI-DEMO-'+(++serial),product_id:product.id,name:product.name,quantity:quantity,
                amount:product.prices[0].amount*quantity,currency:product.prices[0].currencyName,
                payment_name:method.name,state:'waiting',expires:180};
        }
    };
})();

(function(){
    'use strict';
    var cfg=GameUI.CustomUIConfig(),U=cfg.SurvivalUI,R=cfg.RemainingHandoff,D=cfg.SurvivalCommercePreviewData,root=$.GetContextPanel();
    if(cfg.SurvivalCommerceView)cfg.SurvivalCommerceView.Dispose();
    var category=D.catalog.categories[0].id,product=null,quantity=1,method=null,order=null,pending=false,disposed=false,timer=null,serial=0,remaining=180;
    function p(type,parent,cls){var n=$.CreatePanel(type,parent,'');if(cls)n.AddClass(cls);return n;}
    function text(parent,value,cls){var n=p('Label',parent,cls);n.text=String(value);n.hittest=false;return n;}
    function button(parent,label,fn,cls,primary){var n=U.ActionButton(parent,{label:label,action:fn});R.Action(n,primary);if(cls)n.AddClass(cls);return n;}
    function cancelTimer(){serial++;if(timer!==null){$.CancelScheduled(timer);timer=null;}}
    function reset(){cancelTimer();product=null;order=null;pending=false;quantity=1;method=null;}
    function closePurchase(){reset();purchase.shell.Close();}
    function close(){closePurchase();store.shell.Close();}
    function modal(id,title,w,h,onClose){
        var scrim=p('Button',root,'RCBackdrop'),panel=p('Panel',root,'RCWindow'),header=p('Panel',panel,'RCHeader'),heading=text(header,title,'RCTitle'),x=p('Button',header,'RCClose');
        var shell=U.ModalShell.Adopt({id:id,root:root,panel:panel,header:header,titlePanel:heading,scrim:scrim,closeButton:x,width:w,height:h,fit:{reference:[1672,941]},onClose:onClose});
        R.Window(panel,header,x);R.SizeWindow(panel,w,h);R.Box(header,0,0,w,84);R.Box(x,w-66,22,38,38);shell.Close();return {panel:panel,scrim:scrim,shell:shell,title:heading};
    }
    var store=modal('commerce','商城',1210,810,close),purchase=modal('commerce_purchase','订单确认',960,740,closePurchase);
    var tabs=p('Panel',store.panel,'RCTabs'),grid=p('Panel',store.panel,'RCGrid');
    text(store.panel,'演示模式，不可付款 · 商品价格与状态均为模拟','RCNotice');
    D.catalog.categories.forEach(function(c,i){var b=p('Button',tabs,'RCTab');R.Tab(b,i===0?0:i===D.catalog.categories.length-1?3:1);R.Image(b,'tab_glow','RCNavGlow');text(b,c.label,'RCTabText');b.SetPanelEvent('onactivate',function(){if(category===c.id)return;category=c.id;renderCatalog();});b._category=c.id;});
    function art(parent,item,cls){var mapped=cfg.SurvivalItemArt&&cfg.SurvivalItemArt.Create(parent,item.items?item.items[0]:item,cls);if(mapped)return mapped;var n=p('Image',parent,cls);n.SetImage(item.image);n.SetScaling('stretch-to-fit-preserve-aspect');n.hittest=false;return n;}
    function renderCatalog(){
        tabs.Children().forEach(function(b){b.SetHasClass('UISelected',b._category===category);});
        grid.RemoveAndDeleteChildren();var bundle=category==='bundles';grid.SetHasClass('RCBundles',bundle);
        var items=bundle?D.catalog.bundles:D.catalog.products.filter(function(x){return x.category===category;});
        items.forEach(function(item,i){
            var card=U.ProductCard(grid,{name:'',prices:item.prices});card.AddClass('RCProduct');card.SetHasClass('RCFourth',i%4===3);card.SetHasClass('RCSecond',i%2===1);R.Image(card,bundle?'shop_bundle_compact':'shop_card_normal_native','RCCardBase');var caption=text(card,item.name,'RCProductName');caption.style.width='fit-children';caption.style.maxWidth=bundle?'496px':'205px';caption.style.horizontalAlign='center';caption.style.position=bundle?'0px 12px 0px':'0px 199px 0px';
            if(bundle){var contents=p('Panel',card,'RCBundleContents');item.items.forEach(function(x){var slot=p('Panel',contents,'RCBundleItem');art(slot,x,'RCBundleArt');text(slot,x.name,'RCBundleName');text(slot,'×'+x.quantity,'RCBundleQuantity');});button(card,'立即购买',function(){openPurchase(item);},'RCBundleBuy',true);}
            else {art(card,item,'RCProductArt');var hover=p('Panel',card,'RCProductHover');R.Image(hover,'shop_product_hover_scrim','RCHoverScrim');text(hover,item.effect,'RCProductEffect');var buy=button(hover,item.state==='owned'?'已拥有':item.state==='soldout'?'已售罄':'立即购买',function(){openPurchase(item);},'RCProductBuy',true);U.State.Set(buy,{enabled:item.purchasable});if(item.state!=='normal')text(card,item.state==='owned'?'已拥有':'已售罄','RCStockState');}
        });
    }
    var body=p('Panel',purchase.panel,'RCOrderBody'),status=text(purchase.panel,'','RCOrderStatus'),controls=p('Panel',purchase.panel,'RCPreviewControls');
    var labels={loading:'加载中',waiting:'等待扫码',qr_failed:'二维码加载失败',expired:'二维码已过期',complete:'模拟支付成功',failed:'模拟支付失败'};
    Object.keys(labels).forEach(function(s){var b=button(controls,labels[s],function(){setState(s);},'RCPreviewState');b._state=s;});
    function openPurchase(item){if(product||pending||!item.purchasable)return;reset();product=item;quantity=1;method=D.methods[0];renderPurchase();purchase.shell.Open();}
    function createOrder(){if(pending||order||!product)return;pending=true;renderPurchase();var token=++serial;timer=$.Schedule(.4,function(){timer=null;if(disposed||token!==serial||!product)return;order=D.createOrder(product,quantity,method);pending=false;remaining=order.expires;renderPurchase();tick();});}
    function tick(){var token=serial;if(!order||order.state!=='waiting')return;timer=$.Schedule(1,function(){timer=null;if(disposed||token!==serial||!order)return;remaining--;if(remaining<=0){order.state='expired';renderPurchase();return;}var expiry=body.FindChildTraverse('RCExpiryValue');if(expiry)expiry.text='模拟有效期 '+remaining+' 秒 · 测试码无支付含义';tick();});}
    function setState(s){if(!order)return;cancelTimer();order.state=s;remaining=180;renderPurchase();if(s==='waiting')tick();}
    function renderPurchase(){
        body.RemoveAndDeleteChildren();controls.visible=!!order;purchase.title.text=order?'付款码展示':'订单确认';if(!product)return;
        text(body,product.name,'RCOrderName');
        if(!order){
            art(body,product,'RCOrderArt');text(body,product.effect,'RCOrderHint');
            text(body,'模拟合计：'+product.prices[0].amount*quantity+' '+product.prices[0].currencyName,'RCActualAmount');
            var q=p('Panel',body,'RCQuantity');var minus=button(q,'−',function(){if(pending||quantity<=1)return;quantity--;renderPurchase();});text(q,quantity,'RCQuantityText');var plus=button(q,'+',function(){if(pending||quantity>=product.max_quantity)return;quantity++;renderPurchase();});U.State.Set(minus,{enabled:!pending&&quantity>1});U.State.Set(plus,{enabled:!pending&&quantity<product.max_quantity});
            var methods=p('Panel',body,'RCMethods');D.methods.forEach(function(m){var b=p('Button',methods,'RCMethod');R.Image(b,m.id===method.id?'shop_payment_selected':'shop_payment_normal','RCMethodSelected');text(b,m.name,'RCMethodText');b.SetPanelEvent('onactivate',function(){if(pending)return;method=m;renderPurchase();});});
            button(body,'返回商城',closePurchase,'RCOrderBack');var buy=button(body,pending?'生成模拟订单…':'确认模拟订单',createOrder,'RCOrderConfirm',true);U.State.Set(buy,{enabled:!pending});status.text='演示模式，不可付款 · 不扣款、不发放权益';
        }else{
            text(body,'模拟应付：'+order.amount+' '+order.currency+'  ·  数量 '+order.quantity,'RCActualAmount');text(body,order.payment_name+' · 演示模式，不可付款','RCQRHint');
            var qr=p('Panel',body,'RCQR');
            if(order.state==='waiting'){var image=p('Image',qr,'RCQRCode');image.SetImage(D.qr);image.SetScaling('stretch-to-fit-preserve-aspect');image.hittest=false;}
            else {text(qr,labels[order.state],'RCQRState');if(order.state==='qr_failed'||order.state==='expired'||order.state==='failed')button(body,'重新演示',function(){setState('waiting');},'RCQRRetry');}
            var expiry=$.CreatePanel('Label',body,'RCExpiryValue');expiry.AddClass('RCExpiry');expiry.text=order.state==='waiting'?'模拟有效期 '+remaining+' 秒 · 测试码无支付含义':'此状态仅供界面验收';
            button(body,'返回商城',closePurchase,'RCQRBack');status.text=labels[order.state]+' · '+order.id+' · 无真实交易';
        }
        controls.Children().forEach(function(b){b.SetHasClass('RCStateSelected',!!order&&b._state===order.state);});
    }
    cfg.SurvivalCommerceView={Open:function(){if(disposed)return;renderCatalog();store.shell.Open();},Close:close,Dispose:function(){if(disposed)return;disposed=true;reset();purchase.shell.Dispose();store.shell.Dispose();[purchase.panel,purchase.scrim,store.panel,store.scrim].forEach(function(n){if(n.IsValid())n.DeleteAsync(0);});},PreviewState:setState,Inspect:function(){return {category:category,product:product&&product.id,quantity:quantity,order:order,pending:pending,timer:timer!==null};}};
    if(typeof Game!=='undefined'&&Game.AddCommand)Game.AddCommand('shop_ui_preview_open',function(){cfg.SurvivalCommerceView.Open();},'Open local-only commerce UI preview',0);
})();
