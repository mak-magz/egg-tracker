-- M15 client_visible_char (security audit L3 of docs/features/03-clients.md)
--
-- L3  "A client name holds at least one visible character" was only enforced for the Default_Ignorable set (M14).
--     Still accepted as a WHOLE name (and phone): U+FFFC (object replacement), a lone combining mark (U+0301),
--     format characters that are not default-ignorable (U+0600, U+13430), private-use characters (U+E000) and
--     unassigned code points, and a stack of 59 combining marks on one letter ("zalgo").
--
--     Rule (names AND phones, on the NORMALISED text): it must contain at least one letter, number, symbol or
--     punctuation character, that is a code point whose Unicode general category is L*, N*, S* or P*. The categories
--     partition the code points, so this is the same as "not only marks (M*), separators (Z*) and other (C*:
--     controls, format, private use, unassigned)". A lone combining mark is refused; "e" plus a mark is fine.
--     Whitespace is already collapsed and trimmed before the check, so it never counts. Emoji (So) count as visible.
--     ONE EXCEPTION: U+FFFC (object replacement character) is category So (a symbol), so the plain category rule
--     would still accept it, yet it draws a placeholder box or nothing and is the first case the audit listed. It is
--     therefore not counted: visible = (L or N or S or P) except U+FFFC. It is still allowed NEXT TO a visible
--     character (it is not on the hidden-character list, which M14 defined as the default-ignorables).
--     The hidden-character class of M14 still runs first and still refuses hidden characters ANYWHERE in the text
--     (joiners and variation selectors stay refused: owner decision); this rule only adds "and at least one visible".
--
--     Postgres regexes have no property classes, and the [[:alpha:]] classes follow the operating system's libc, so
--     they would differ between machines. The class is therefore spelled out as explicit ranges, generated from the
--     Unicode data of Node 24 (Unicode 17.0): 801 merged ranges of the code points matching
--     /[\p{L}\p{N}\p{S}\p{P}]/u, minus U+FFFC (157,068 code points). It is compared with the JavaScript rule over EVERY code point by
--     tests/unit/client-name-parity.spec.ts, and by a one-off run against the live database (0 differences).
--     Versioning: a code point assigned in a LATER Unicode version is "unassigned" here, so a name made only of such
--     characters is refused until this class is regenerated (new migration); a name with any other visible character
--     is unaffected. When Node's Unicode data moves on, the parity spec fails and says so: regenerate the ranges
--     (merge the matching code points into ranges, write them as u + 4 hex or U + 8 hex escapes) in a new migration
--     and in the parity spec's expectations. The class is only searched for its FIRST match, so it costs one linear
--     scan of at most 200 characters (the raw-input cap runs first), and an ASCII letter or digit, the common case,
--     is found by a tiny class before the big one is used.
--
--     The same rule is applied to the phone (free text, but if present it needs at least one visible character:
--     "555-1234", "(555)", "+63" and "ext" pass; only-marks, private-use and similar fail). No digit is required.
--
--     Existing data: nothing is deployed and the local database is empty, so no data migration is needed. ADD
--     CONSTRAINT checks the existing rows and would fail loudly if one had no visible character (better than the
--     silent legacy-row trap of M14's note: the CHECK constraints run again on every UPDATE of a row).
--
--     Not done: a cap on how many combining marks may follow one base character (zalgo). It would need a second
--     ~300-range class (the M* categories) and a threshold that legitimate scripts (Thai, Hebrew with niqqud and
--     cantillation, Vietnamese, Tibetan stacks) must not trip; the 60-character name limit already bounds the damage,
--     and a stack still needs a visible letter to pass.--
-- Messages and hints are unchanged: a name with no visible character raises TM017 with hint 'invalid' (the form's
-- "This name has a hidden character" copy), a phone TM018 'invalid'. The order stays: raw over 200, blank, invalid
-- (hidden character, then no visible character), too long. No SQLSTATE or signature changes. Everything stays
-- security invoker with search_path = ''.

-- ---------------------------------------------------------------------------
-- The helper. Cheap check first: an ASCII letter or digit settles it.
-- ---------------------------------------------------------------------------
create function app.client_text_visible(p_text text)
  returns boolean
  language sql
  immutable
  security invoker
  set search_path = ''
as $$
  select case
    when p_text ~ '[0-9A-Za-z]' then true
    else p_text ~ '[\u0021-\u007E\u00A1-\u00AC\u00AE-\u02FF\u0370-\u0377\u037A-\u037F\u0384-\u038A\u038C\u038E-\u03A1\u03A3-\u0482\u048A-\u052F\u0531-\u0556\u0559-\u058A\u058D-\u058F\u05BE\u05C0\u05C3\u05C6\u05D0-\u05EA\u05EF-\u05F4\u0606-\u060F\u061B\u061D-\u064A\u0660-\u066F\u0671-\u06D5\u06DE\u06E5-\u06E6\u06E9\u06EE-\u070D\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07C0-\u07EA\u07F4-\u07FA\u07FE-\u0815\u081A\u0824\u0828\u0830-\u083E\u0840-\u0858\u085E\u0860-\u086A\u0870-\u088F\u08A0-\u08C9\u0904-\u0939\u093D\u0950\u0958-\u0961\u0964-\u0980\u0985-\u098C\u098F-\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC-\u09DD\u09DF-\u09E1\u09E6-\u09FD\u0A05-\u0A0A\u0A0F-\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32-\u0A33\u0A35-\u0A36\u0A38-\u0A39\u0A59-\u0A5C\u0A5E\u0A66-\u0A6F\u0A72-\u0A74\u0A76\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2-\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0-\u0AE1\u0AE6-\u0AF1\u0AF9\u0B05-\u0B0C\u0B0F-\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32-\u0B33\u0B35-\u0B39\u0B3D\u0B5C-\u0B5D\u0B5F-\u0B61\u0B66-\u0B77\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99-\u0B9A\u0B9C\u0B9E-\u0B9F\u0BA3-\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0BE6-\u0BFA\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D\u0C58-\u0C5A\u0C5C-\u0C5D\u0C60-\u0C61\u0C66-\u0C6F\u0C77-\u0C80\u0C84-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDC-\u0CDE\u0CE0-\u0CE1\u0CE6-\u0CEF\u0CF1-\u0CF2\u0D04-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E-\u0D4F\u0D54-\u0D56\u0D58-\u0D61\u0D66-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0DE6-\u0DEF\u0DF4\u0E01-\u0E30\u0E32-\u0E33\u0E3F-\u0E46\u0E4F-\u0E5B\u0E81-\u0E82\u0E84\u0E86-\u0E8A\u0E8C-\u0EA3\u0EA5\u0EA7-\u0EB0\u0EB2-\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0ED0-\u0ED9\u0EDC-\u0EDF\u0F00-\u0F17\u0F1A-\u0F34\u0F36\u0F38\u0F3A-\u0F3D\u0F40-\u0F47\u0F49-\u0F6C\u0F85\u0F88-\u0F8C\u0FBE-\u0FC5\u0FC7-\u0FCC\u0FCE-\u0FDA\u1000-\u102A\u103F-\u1055\u105A-\u105D\u1061\u1065-\u1066\u106E-\u1070\u1075-\u1081\u108E\u1090-\u1099\u109E-\u10C5\u10C7\u10CD\u10D0-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1360-\u137C\u1380-\u1399\u13A0-\u13F5\u13F8-\u13FD\u1400-\u167F\u1681-\u169C\u16A0-\u16F8\u1700-\u1711\u171F-\u1731\u1735-\u1736\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D4-\u17DC\u17E0-\u17E9\u17F0-\u17F9\u1800-\u180A\u1810-\u1819\u1820-\u1878\u1880-\u1884\u1887-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191E\u1940\u1944-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u19D0-\u19DA\u19DE-\u1A16\u1A1E-\u1A54\u1A80-\u1A89\u1A90-\u1A99\u1AA0-\u1AAD\u1B05-\u1B33\u1B45-\u1B4C\u1B4E-\u1B6A\u1B74-\u1B7F\u1B83-\u1BA0\u1BAE-\u1BE5\u1BFC-\u1C23\u1C3B-\u1C49\u1C4D-\u1C8A\u1C90-\u1CBA\u1CBD-\u1CC7\u1CD3\u1CE9-\u1CEC\u1CEE-\u1CF3\u1CF5-\u1CF6\u1CFA\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FC4\u1FC6-\u1FD3\u1FD6-\u1FDB\u1FDD-\u1FEF\u1FF2-\u1FF4\u1FF6-\u1FFE\u2010-\u2027\u2030-\u205E\u2070-\u2071\u2074-\u208E\u2090-\u209C\u20A0-\u20C1\u2100-\u218B\u2190-\u2429\u2440-\u244A\u2460-\u2B73\u2B76-\u2CEE\u2CF2-\u2CF3\u2CF9-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F-\u2D70\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2E00-\u2E5D\u2E80-\u2E99\u2E9B-\u2EF3\u2F00-\u2FD5\u2FF0-\u2FFF\u3001-\u3029\u3030-\u303F\u3041-\u3096\u309B-\u30FF\u3105-\u312F\u3131-\u318E\u3190-\u31E5\u31EF-\u321E\u3220-\uA48C\uA490-\uA4C6\uA4D0-\uA62B\uA640-\uA66E\uA673\uA67E-\uA69D\uA6A0-\uA6EF\uA6F2-\uA6F7\uA700-\uA7DC\uA7F1-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA828-\uA82B\uA830-\uA839\uA840-\uA877\uA882-\uA8B3\uA8CE-\uA8D9\uA8F2-\uA8FE\uA900-\uA925\uA92E-\uA946\uA95F-\uA97C\uA984-\uA9B2\uA9C1-\uA9CD\uA9CF-\uA9D9\uA9DE-\uA9E4\uA9E6-\uA9FE\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA50-\uAA59\uAA5C-\uAA7A\uAA7E-\uAAAF\uAAB1\uAAB5-\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAAEA\uAAF0-\uAAF4\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB6B\uAB70-\uABE2\uABEB\uABF0-\uABF9\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB36\uFB38-\uFB3C\uFB3E\uFB40-\uFB41\uFB43-\uFB44\uFB46-\uFDCF\uFDF0-\uFDFF\uFE10-\uFE19\uFE30-\uFE52\uFE54-\uFE66\uFE68-\uFE6B\uFE70-\uFE74\uFE76-\uFEFC\uFF01-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC\uFFE0-\uFFE6\uFFE8-\uFFEE\uFFFD\U00010000-\U0001000B\U0001000D-\U00010026\U00010028-\U0001003A\U0001003C-\U0001003D\U0001003F-\U0001004D\U00010050-\U0001005D\U00010080-\U000100FA\U00010100-\U00010102\U00010107-\U00010133\U00010137-\U0001018E\U00010190-\U0001019C\U000101A0\U000101D0-\U000101FC\U00010280-\U0001029C\U000102A0-\U000102D0\U000102E1-\U000102FB\U00010300-\U00010323\U0001032D-\U0001034A\U00010350-\U00010375\U00010380-\U0001039D\U0001039F-\U000103C3\U000103C8-\U000103D5\U00010400-\U0001049D\U000104A0-\U000104A9\U000104B0-\U000104D3\U000104D8-\U000104FB\U00010500-\U00010527\U00010530-\U00010563\U0001056F-\U0001057A\U0001057C-\U0001058A\U0001058C-\U00010592\U00010594-\U00010595\U00010597-\U000105A1\U000105A3-\U000105B1\U000105B3-\U000105B9\U000105BB-\U000105BC\U000105C0-\U000105F3\U00010600-\U00010736\U00010740-\U00010755\U00010760-\U00010767\U00010780-\U00010785\U00010787-\U000107B0\U000107B2-\U000107BA\U00010800-\U00010805\U00010808\U0001080A-\U00010835\U00010837-\U00010838\U0001083C\U0001083F-\U00010855\U00010857-\U0001089E\U000108A7-\U000108AF\U000108E0-\U000108F2\U000108F4-\U000108F5\U000108FB-\U0001091B\U0001091F-\U00010939\U0001093F-\U00010959\U00010980-\U000109B7\U000109BC-\U000109CF\U000109D2-\U00010A00\U00010A10-\U00010A13\U00010A15-\U00010A17\U00010A19-\U00010A35\U00010A40-\U00010A48\U00010A50-\U00010A58\U00010A60-\U00010A9F\U00010AC0-\U00010AE4\U00010AEB-\U00010AF6\U00010B00-\U00010B35\U00010B39-\U00010B55\U00010B58-\U00010B72\U00010B78-\U00010B91\U00010B99-\U00010B9C\U00010BA9-\U00010BAF\U00010C00-\U00010C48\U00010C80-\U00010CB2\U00010CC0-\U00010CF2\U00010CFA-\U00010D23\U00010D30-\U00010D39\U00010D40-\U00010D65\U00010D6E-\U00010D85\U00010D8E-\U00010D8F\U00010E60-\U00010E7E\U00010E80-\U00010EA9\U00010EAD\U00010EB0-\U00010EB1\U00010EC2-\U00010EC7\U00010ED0-\U00010ED8\U00010F00-\U00010F27\U00010F30-\U00010F45\U00010F51-\U00010F59\U00010F70-\U00010F81\U00010F86-\U00010F89\U00010FB0-\U00010FCB\U00010FE0-\U00010FF6\U00011003-\U00011037\U00011047-\U0001104D\U00011052-\U0001106F\U00011071-\U00011072\U00011075\U00011083-\U000110AF\U000110BB-\U000110BC\U000110BE-\U000110C1\U000110D0-\U000110E8\U000110F0-\U000110F9\U00011103-\U00011126\U00011136-\U00011144\U00011147\U00011150-\U00011172\U00011174-\U00011176\U00011183-\U000111B2\U000111C1-\U000111C8\U000111CD\U000111D0-\U000111DF\U000111E1-\U000111F4\U00011200-\U00011211\U00011213-\U0001122B\U00011238-\U0001123D\U0001123F-\U00011240\U00011280-\U00011286\U00011288\U0001128A-\U0001128D\U0001128F-\U0001129D\U0001129F-\U000112A9\U000112B0-\U000112DE\U000112F0-\U000112F9\U00011305-\U0001130C\U0001130F-\U00011310\U00011313-\U00011328\U0001132A-\U00011330\U00011332-\U00011333\U00011335-\U00011339\U0001133D\U00011350\U0001135D-\U00011361\U00011380-\U00011389\U0001138B\U0001138E\U00011390-\U000113B5\U000113B7\U000113D1\U000113D3-\U000113D5\U000113D7-\U000113D8\U00011400-\U00011434\U00011447-\U0001145B\U0001145D\U0001145F-\U00011461\U00011480-\U000114AF\U000114C4-\U000114C7\U000114D0-\U000114D9\U00011580-\U000115AE\U000115C1-\U000115DB\U00011600-\U0001162F\U00011641-\U00011644\U00011650-\U00011659\U00011660-\U0001166C\U00011680-\U000116AA\U000116B8-\U000116B9\U000116C0-\U000116C9\U000116D0-\U000116E3\U00011700-\U0001171A\U00011730-\U00011746\U00011800-\U0001182B\U0001183B\U000118A0-\U000118F2\U000118FF-\U00011906\U00011909\U0001190C-\U00011913\U00011915-\U00011916\U00011918-\U0001192F\U0001193F\U00011941\U00011944-\U00011946\U00011950-\U00011959\U000119A0-\U000119A7\U000119AA-\U000119D0\U000119E1-\U000119E3\U00011A00\U00011A0B-\U00011A32\U00011A3A\U00011A3F-\U00011A46\U00011A50\U00011A5C-\U00011A89\U00011A9A-\U00011AA2\U00011AB0-\U00011AF8\U00011B00-\U00011B09\U00011BC0-\U00011BE1\U00011BF0-\U00011BF9\U00011C00-\U00011C08\U00011C0A-\U00011C2E\U00011C40-\U00011C45\U00011C50-\U00011C6C\U00011C70-\U00011C8F\U00011D00-\U00011D06\U00011D08-\U00011D09\U00011D0B-\U00011D30\U00011D46\U00011D50-\U00011D59\U00011D60-\U00011D65\U00011D67-\U00011D68\U00011D6A-\U00011D89\U00011D98\U00011DA0-\U00011DA9\U00011DB0-\U00011DDB\U00011DE0-\U00011DE9\U00011EE0-\U00011EF2\U00011EF7-\U00011EF8\U00011F02\U00011F04-\U00011F10\U00011F12-\U00011F33\U00011F43-\U00011F59\U00011FB0\U00011FC0-\U00011FF1\U00011FFF-\U00012399\U00012400-\U0001246E\U00012470-\U00012474\U00012480-\U00012543\U00012F90-\U00012FF2\U00013000-\U0001342F\U00013441-\U00013446\U00013460-\U000143FA\U00014400-\U00014646\U00016100-\U0001611D\U00016130-\U00016139\U00016800-\U00016A38\U00016A40-\U00016A5E\U00016A60-\U00016A69\U00016A6E-\U00016ABE\U00016AC0-\U00016AC9\U00016AD0-\U00016AED\U00016AF5\U00016B00-\U00016B2F\U00016B37-\U00016B45\U00016B50-\U00016B59\U00016B5B-\U00016B61\U00016B63-\U00016B77\U00016B7D-\U00016B8F\U00016D40-\U00016D79\U00016E40-\U00016E9A\U00016EA0-\U00016EB8\U00016EBB-\U00016ED3\U00016F00-\U00016F4A\U00016F50\U00016F93-\U00016F9F\U00016FE0-\U00016FE3\U00016FF2-\U00016FF6\U00017000-\U00018CD5\U00018CFF-\U00018D1E\U00018D80-\U00018DF2\U0001AFF0-\U0001AFF3\U0001AFF5-\U0001AFFB\U0001AFFD-\U0001AFFE\U0001B000-\U0001B122\U0001B132\U0001B150-\U0001B152\U0001B155\U0001B164-\U0001B167\U0001B170-\U0001B2FB\U0001BC00-\U0001BC6A\U0001BC70-\U0001BC7C\U0001BC80-\U0001BC88\U0001BC90-\U0001BC99\U0001BC9C\U0001BC9F\U0001CC00-\U0001CCFC\U0001CD00-\U0001CEB3\U0001CEBA-\U0001CED0\U0001CEE0-\U0001CEF0\U0001CF50-\U0001CFC3\U0001D000-\U0001D0F5\U0001D100-\U0001D126\U0001D129-\U0001D164\U0001D16A-\U0001D16C\U0001D183-\U0001D184\U0001D18C-\U0001D1A9\U0001D1AE-\U0001D1EA\U0001D200-\U0001D241\U0001D245\U0001D2C0-\U0001D2D3\U0001D2E0-\U0001D2F3\U0001D300-\U0001D356\U0001D360-\U0001D378\U0001D400-\U0001D454\U0001D456-\U0001D49C\U0001D49E-\U0001D49F\U0001D4A2\U0001D4A5-\U0001D4A6\U0001D4A9-\U0001D4AC\U0001D4AE-\U0001D4B9\U0001D4BB\U0001D4BD-\U0001D4C3\U0001D4C5-\U0001D505\U0001D507-\U0001D50A\U0001D50D-\U0001D514\U0001D516-\U0001D51C\U0001D51E-\U0001D539\U0001D53B-\U0001D53E\U0001D540-\U0001D544\U0001D546\U0001D54A-\U0001D550\U0001D552-\U0001D6A5\U0001D6A8-\U0001D7CB\U0001D7CE-\U0001D9FF\U0001DA37-\U0001DA3A\U0001DA6D-\U0001DA74\U0001DA76-\U0001DA83\U0001DA85-\U0001DA8B\U0001DF00-\U0001DF1E\U0001DF25-\U0001DF2A\U0001E030-\U0001E06D\U0001E100-\U0001E12C\U0001E137-\U0001E13D\U0001E140-\U0001E149\U0001E14E-\U0001E14F\U0001E290-\U0001E2AD\U0001E2C0-\U0001E2EB\U0001E2F0-\U0001E2F9\U0001E2FF\U0001E4D0-\U0001E4EB\U0001E4F0-\U0001E4F9\U0001E5D0-\U0001E5ED\U0001E5F0-\U0001E5FA\U0001E5FF\U0001E6C0-\U0001E6DE\U0001E6E0-\U0001E6E2\U0001E6E4-\U0001E6E5\U0001E6E7-\U0001E6ED\U0001E6F0-\U0001E6F4\U0001E6FE-\U0001E6FF\U0001E7E0-\U0001E7E6\U0001E7E8-\U0001E7EB\U0001E7ED-\U0001E7EE\U0001E7F0-\U0001E7FE\U0001E800-\U0001E8C4\U0001E8C7-\U0001E8CF\U0001E900-\U0001E943\U0001E94B\U0001E950-\U0001E959\U0001E95E-\U0001E95F\U0001EC71-\U0001ECB4\U0001ED01-\U0001ED3D\U0001EE00-\U0001EE03\U0001EE05-\U0001EE1F\U0001EE21-\U0001EE22\U0001EE24\U0001EE27\U0001EE29-\U0001EE32\U0001EE34-\U0001EE37\U0001EE39\U0001EE3B\U0001EE42\U0001EE47\U0001EE49\U0001EE4B\U0001EE4D-\U0001EE4F\U0001EE51-\U0001EE52\U0001EE54\U0001EE57\U0001EE59\U0001EE5B\U0001EE5D\U0001EE5F\U0001EE61-\U0001EE62\U0001EE64\U0001EE67-\U0001EE6A\U0001EE6C-\U0001EE72\U0001EE74-\U0001EE77\U0001EE79-\U0001EE7C\U0001EE7E\U0001EE80-\U0001EE89\U0001EE8B-\U0001EE9B\U0001EEA1-\U0001EEA3\U0001EEA5-\U0001EEA9\U0001EEAB-\U0001EEBB\U0001EEF0-\U0001EEF1\U0001F000-\U0001F02B\U0001F030-\U0001F093\U0001F0A0-\U0001F0AE\U0001F0B1-\U0001F0BF\U0001F0C1-\U0001F0CF\U0001F0D1-\U0001F0F5\U0001F100-\U0001F1AD\U0001F1E6-\U0001F202\U0001F210-\U0001F23B\U0001F240-\U0001F248\U0001F250-\U0001F251\U0001F260-\U0001F265\U0001F300-\U0001F6D8\U0001F6DC-\U0001F6EC\U0001F6F0-\U0001F6FC\U0001F700-\U0001F7D9\U0001F7E0-\U0001F7EB\U0001F7F0\U0001F800-\U0001F80B\U0001F810-\U0001F847\U0001F850-\U0001F859\U0001F860-\U0001F887\U0001F890-\U0001F8AD\U0001F8B0-\U0001F8BB\U0001F8C0-\U0001F8C1\U0001F8D0-\U0001F8D8\U0001F900-\U0001FA57\U0001FA60-\U0001FA6D\U0001FA70-\U0001FA7C\U0001FA80-\U0001FA8A\U0001FA8E-\U0001FAC6\U0001FAC8\U0001FACD-\U0001FADC\U0001FADF-\U0001FAEA\U0001FAEF-\U0001FAF8\U0001FB00-\U0001FB92\U0001FB94-\U0001FBFA\U00020000-\U0002A6DF\U0002A700-\U0002B81D\U0002B820-\U0002CEAD\U0002CEB0-\U0002EBE0\U0002EBF0-\U0002EE5D\U0002F800-\U0002FA1D\U00030000-\U0003134A\U00031350-\U00033479]'
  end
$$;

comment on function app.client_text_visible(text) is
  'True when the text holds at least one letter, number, symbol or punctuation character (Unicode L, N, S or P except U+FFFC; Unicode 17.0, as explicit ranges). Twin of hasVisibleClientTextChar().';

revoke all on function app.client_text_visible(text) from public;
grant execute on function app.client_text_visible(text) to authenticated;

-- ---------------------------------------------------------------------------
-- The shared rule (trigger and the four functions call it): the same signature, so grants stay. Only the two
-- 'invalid' steps change.
-- ---------------------------------------------------------------------------
create or replace function app.assert_client_fields(p_name text, p_phone text, p_price numeric)
  returns void
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  if p_name is null or p_name = '' then
    raise exception 'client name is required' using errcode = 'TM017', hint = 'blank';
  end if;
  if app.client_text_invalid(p_name) or not app.client_text_visible(p_name) then
    raise exception 'client name has a hidden character' using errcode = 'TM017', hint = 'invalid';
  end if;
  if char_length(p_name) > 60 then
    raise exception 'client name is too long' using errcode = 'TM017', hint = 'too_long';
  end if;

  if p_phone is not null then
    if app.client_text_invalid(p_phone) or not app.client_text_visible(p_phone) then
      raise exception 'client phone has a hidden character' using errcode = 'TM018', hint = 'invalid';
    end if;
    if char_length(p_phone) > 30 then
      raise exception 'client phone is too long' using errcode = 'TM018', hint = 'too_long';
    end if;
  end if;

  -- NaN sorts above every number in Postgres and -Infinity below, so they land on too_large and not_positive.
  if p_price is not null then
    if p_price <= 0 then
      raise exception 'default price must be above 0' using errcode = 'TM019', hint = 'not_positive';
    end if;
    if p_price > 9999.99 then
      raise exception 'default price is too large' using errcode = 'TM019', hint = 'too_large';
    end if;
    if p_price <> round(p_price, 2) then
      raise exception 'default price has too many decimals' using errcode = 'TM019', hint = 'too_many_decimals';
    end if;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- The CHECK constraints: a second lock behind the trigger (they hold when the trigger is off, and they guard
-- every write path).
-- ---------------------------------------------------------------------------
alter table public.clients
  add constraint clients_name_visible check (app.client_text_visible(name)),
  add constraint clients_phone_visible check (phone is null or app.client_text_visible(phone));

comment on constraint clients_name_visible on public.clients is
  'A name holds at least one letter, number, symbol or punctuation character (audit L3).';
comment on constraint clients_phone_visible on public.clients is
  'A phone, if present, holds at least one letter, number, symbol or punctuation character (audit L3).';
