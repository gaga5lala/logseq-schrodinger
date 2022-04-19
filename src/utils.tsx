import "@logseq/libs";
import {
  PageEntity,
  BlockEntity,
  SettingSchemaDesc,
} from "@logseq/libs/dist/LSPlugin";
import JSZip, { file } from "jszip";
import { saveAs } from "file-saver";
export var blocks2 = [];
import React from "react";
import ReactDOM from "react-dom";
import App from "./App";
import { handleClosePopup } from "./handleClosePopup";
import { path } from "./index";
import { title } from "process";
var errorTracker = [];
var zip = new JSZip();
var imageTracker = [];
let qresult;

//Retired function
//I kept on missing pages?!?!?!
//Never figured out why
export async function getAllPublicPages_orig() {
  errorTracker = [];
  logseq.DB.q("(page-property public)").then((result) => {
    const mappedResults = result.map((page) => {
      return page.name;
    });
    for (const x in mappedResults) {
      if (x != `${mappedResults.length - 1}`) {
        console.log(`DB ${x} (≠)`, mappedResults[x]);
        getBlocksInPage({ page: mappedResults[x] }, false, false);
      } else {
        console.log(`DB ${x}`, mappedResults[x]);
        getBlocksInPage({ page: mappedResults[x] }, false, true);
      }
    }
  });
}

export async function getAllPublicPages() {
  //needs to be both public, and a page (with a name)
  const query =
    "[:find (pull ?p [*]) :where [?p :block/properties ?pr] [(get ?pr :public) ?t] [(= true ?t)][?p :block/name ?n]]";
  qresult = await logseq.DB.datascriptQuery(query);
  qresult = qresult?.flat();
  for (const x in qresult) {
    if (x != `${qresult.length - 1}`) {
      await getBlocksInPage({ page: qresult[x] }, false, false);
    } else {
      await getBlocksInPage({ page: qresult[x] }, false, true);
    }
  }
}

function hugoDate(timestamp) {
  let date = new Date(timestamp);

  //if date.getdate does not have a zero, add A ZERO BEFORE IT
  let month;
  if (date.getMonth() + 1 < 10) {
    month = `0${date.getMonth() + 1}`;
  } else {
    month = `${date.getMonth() + 1}`;
  }
  let day;
  if (date.getDate() < 10) {
    day = `0${date.getDate()}`;
  } else {
    day = `${date.getDate()}`;
  }

  return `${date.getFullYear()}-${month}-${day}`;
}

//parse files meta-data
async function parseMeta(
  curPage,
  tagsArray = [],
  dateArray = [],
  titleDetails = [],
  categoriesArray = []
) {
  // console.log("DB curPage", curPage)
  // console.log("Hi")
  let propList = [];

  //get all properties - fix later
  if (curPage?.page.properties != undefined) {
    propList = curPage?.page.properties;
  }
  //Title
  //FIXME is filename used?
  propList.title = curPage.page["original-name"];
  // console.log(curPage);
  // console.log(propList.title);
  // console.log(propList);
  if (titleDetails.length > 0) {
    propList.title = titleDetails[0].noteName;
    propList.fileName = titleDetails[1].hugoFileName;
  }

  //Tags
  propList.tags = curPage?.page.properties.tags
    ? curPage?.page.properties.tags
    : [];
  if (tagsArray != []) {
    let formattedTagsArray = [];
    for (const tag in tagsArray) {
      formattedTagsArray.push(tagsArray[tag].tags);
    }
    if (propList.tags != undefined) {
      for (const tag in formattedTagsArray) {
        console.log(propList);
        propList.tags.push(formattedTagsArray[tag]);
      }
    } else {
      propList.tags = formattedTagsArray;
    }
  }

  //Categories - 2 possible spellings!
  const tmpCat = curPage?.page.properties.category
    ? curPage?.page.properties.category
    : [];
  propList.categories = curPage?.page.properties.categories
    ? curPage?.page.properties.categories
    : tmpCat;
  if (categoriesArray != []) {
    let formattedCategoriesArray = [];
    for (const category in categoriesArray) {
      formattedCategoriesArray.push(categoriesArray[category].category);
    }
    if (propList.categories != undefined) {
      for (const category in formattedCategoriesArray) {
        propList.categories.push(formattedCategoriesArray[category]);
      }
    } else {
      propList.categories = formattedCategoriesArray;
    }
  }

  //Date - if not defined, convert Logseq timestamp
  propList.date = curPage?.page.properties.date
    ? curPage?.page.properties.date
    : hugoDate(curPage.page["created-at"]);
  propList.lastMod = curPage?.page.properties.lastmod
    ? curPage?.page.properties.lastmod
    : hugoDate(curPage.page["updated-at"]);
  if (dateArray.length > 0) {
    propList.date = dateArray[1].originalDate;
    propList.lastMod = dateArray[0].updatedDate;
  }

  //these properties should not be exported to Hugo
  const nope = ["filters", "public"]
  for (const nono of nope){
    delete propList[nono]
  }
  
  //convert propList to Hugo yaml
  // https://gohugo.io/content-management/front-matter/
  // console.log("DB proplist", propList)
  let ret = `---`;
  for (let [prop, value] of Object.entries(propList)) {
    if (Array.isArray(value)) {
      ret += `\n${prop}:`;
      value.forEach((element) => (ret += `\n- ${element}`));
    } else {
      ret += `\n${prop}: ${value}`;
    }
  }
  ret += "\n---";
  // console.log("Metadata:",ret)
  return ret;
}

export async function getBlocksInPage(
  e,
  singleFile,
  isLast,
  tagsArray = [],
  dateArray = [],
  titleDetails = [],
  categoriesArray = [],
  qresult = []
) {
  //if e.page.originalName is undefined, set page to equal e.page.original-name
  // console.log("DB e", e)
  let curPage = e.page;
  if (curPage.originalName != undefined) {
    curPage["original-name"] = curPage.originalName;
  }

  const docTree = await logseq.Editor.getPageBlocksTree(
    curPage["original-name"]
  );

  const metaData = await parseMeta(
    e,
    tagsArray,
    dateArray,
    titleDetails,
    categoriesArray
  );
  // parse page-content

  let finalString = await parsePage(metaData, docTree);
  // console.log("DB finalstring", finalString)

  // FIXME ??
  if (singleFile) {
    logseq.hideMainUI();
    handleClosePopup();
    download(`${titleDetails[1].hugoFileName}.md`, finalString);
  } else {
    console.log(e["original-name"]);
    //page looks better in the URL
    zip.file(
      `page/${curPage["original-name"].replaceAll(
        /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g,
        ""
      )}.md`,
      finalString
    );

    if (isLast) {
      setTimeout(() => {
        console.log(zip);
        zip.generateAsync({ type: "blob" }).then(function (content) {
          // see FileSaver.js
          saveAs(content, "publicExport.zip");
          //wait one second
          // setTimeout(() => {
          //   saveAs(content, "publicExport.zip");
          // }, 1000);
          zip = new JSZip();
        });
      }, imageTracker.length * 102);
    }
  }
}

async function parsePage(finalString: string, docTree) {
  // console.log("DB parsePage")
  for (const x in docTree) {
    // skip meta-data
    if (!(parseInt(x) === 0 && docTree[x].level === 1)) {
      finalString = `${finalString}\n${await parseText(docTree[x])}`;
      if (docTree[x].children.length > 0)
        finalString = await parsePage(finalString, docTree[x].children);
    }
  }
  return finalString;
}

async function parseText(block: BlockEntity) {
  let re: RegExp;
  let text = block.content;
  // console.log("block", block)
  let txtBefore: string = "";
  let txtAfter: string = "\n";
  const prevBlock: BlockEntity = await logseq.Editor.getBlock(block.left.id, {
    includeChildren: false,
  });

  //Block refs needs to be at the beginning so the block gets parsed
  const rxGetId = /\(\(([^)]*)\)\)/;
  const blockId = rxGetId.exec(text);
  if (blockId != null) {
    const block = await logseq.Editor.getBlock(blockId[1], {
      includeChildren: true,
    });

    if (block != null) {
      text = text.replace(
        `((${blockId[1]}))`,
        block.content.substring(0, block.content.indexOf("id::"))
      );
    }
  }

  //FIXME ![image.png](../assets/image_1650196318593_0.png){:class medium, :height 506, :width 321}
  //Logseq has extra info: height and width that can be used in an image template
  //Get regex to check if text contains a md image
  const reImage = /!\[.*?\]\((.*?)\)/g;
  try {
    text.match(reImage).forEach((element) => {
      element.match(/(?<=!\[.*\])(.*)/g).forEach((match) => {
        let finalLink = match.substring(1, match.length - 1);
        // return (match.substring(1, match.length - 1))
        text = text.replace(match, match.toLowerCase());
        if (!finalLink.includes("http") || !finalLink.includes(".pdf")) {
          text = text.replace("../", "/");
          imageTracker.push(finalLink);
          addImageToZip(finalLink);
        }
      });
    });
  } catch (error) { }

  // FIXME for now all indention is stripped out
  // Add indention — level zero is stripped of "-", rest are lists
  // Experiment, no more lists, unless + or numbers
  // (unless they're not)
  if (logseq.settings.bulletHandling == "Convert Bullets") {
    if (block.level > 1) {
      txtBefore = " ".repeat((block.level - 1) * 2) + "+ ";
      // txtBefore = "\n" + txtBefore
      if (prevBlock.level === block.level) txtAfter = "";
    }
  }
  if (prevBlock.level === block.level) txtAfter = "";
  //exceptions (logseq has "-" before every block, Hugo doesn't)
  if (text.substring(0, 3) === "```") txtBefore = "";
  // Don't - indent images
  if (reImage.test(text)) txtBefore = "";
  //indent text + add newline after block
  text = txtBefore + text + txtAfter;


  // FIXME This needs to be rewritten (later) so we don't loop all the pages twice
  // conversion of links to hugo syntax https://gohugo.io/content-management/cross-references/
  // Two kinds of links: [[a link]]
  //                     [A description]([[a link]])
  // Regular links are done by Hugo [logseq](https://logseq.com)
  const reLink:RegExp      = /\[\[.*?\]\]/g
  const reDescrLink:RegExp = /\[([a-zA-Z ]*?)\]\(\[\[(.*?)\]\]\)/g
                             //[garden]([[digital garden]])
  if (logseq.settings.linkFormat == "Hugo Format") {
    if (reDescrLink.test(text)) {
      text = text.replaceAll(reDescrLink, (result) => {
        for (const x in qresult) {
          if (result[2].toLowerCase == qresult[x]["original-name"].toLowerCase) {
            const txt = reDescrLink.exec(result)
            return (txt) ? `[${txt[1]}]({{< ref "${txt[2]}" >}})` : ""
            // return (txt) ? `[${txt[1]}]({{< ref "${txt[2].replaceAll(" ","_")}" >}})` : ""
          }
        }
      });
    }
    text = text.replaceAll(reLink, (match) => {
      const txt = match.substring(2, match.length - 2);
      // console.log(qresult)
      for (const x in qresult) {
        // console.log(txt.toUpperCase())
        // console.log(qresult[x]["original-name"].toUpperCase())
        // console.log(txt.toUpperCase() == qresult[x]["original-name"].toUpperCase())
        if (txt.toUpperCase() == qresult[x]["original-name"].toUpperCase()) {
          // console.log("match")
          return `[${txt}]({{< ref "${qresult[x]["original-name"].replaceAll(
            " ",
            " "
          )}" >}})`;
        }
      }
      return txt;
    });
  }
  if (logseq.settings.linkFormat == "Without brackets") {
    text = text.replaceAll("[[", "");
    text = text.replaceAll("]]", "");
  }

  //highlighted text, not supported in hugo by default!
  re = /(==(.*?)==)/gm;
  text = text.replace(re, "{{< logseq/mark >}}$2{{< / logseq/mark >}}");

  re = /#\+BEGIN_([A-Z]*).*\n(.*)\n#\+END_.*/gm;
  text = text.replace(re, "{{< logseq/org$1 >}}$2{{< / logseq/org$1 >}}");
  // text = text.toLowerCase();

  text = text.replace(/:LOGBOOK:|collapsed:: true/gi, "");
  if (text.includes("CLOCK: [")) {
    text = text.substring(0, text.indexOf("CLOCK: ["));
  }

  if (text.indexOf(`\nid:: `) === -1) {
    return text;
  } else {
    return text.substring(0, text.indexOf(`\nid:: `));
  }
}
function getBase64Image(img) {
  var canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  var ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  var dataURL = canvas.toDataURL("image/png");
  return dataURL.replace(/^data:image\/(png|jpg);base64,/, "");
}

function addImageToZip(filePath) {
  var element = document.createElement("img");
  let formattedFilePath = filePath.replace("..", path);
  element.setAttribute("src", formattedFilePath);
  element.style.display = "none";

  document.body.appendChild(element);
  setTimeout(() => {
    var base64 = getBase64Image(element);
    document.body.removeChild(element);
    if (base64 != "data:,") {
      zip.file(
        "assets/" +
          filePath.split("/")[filePath.split("/").length - 1].toLowerCase(),
        base64,
        { base64: true }
      );
    } else {
      console.log(base64);
    }
  }, 100);
}

//FIXME don't get it, but it works
function download(filename, text) {
  // console.log("DB:download", filename, text)
  var element = document.createElement("a");
  element.setAttribute(
    "href",
    "data:text/plain;charset=utf-8," + encodeURIComponent(text)
  );
  // element.setAttribute('download', filename);
  element.setAttribute("download", filename);

  element.style.display = "none";
  document.body.appendChild(element);

  element.click();

  document.body.removeChild(element);
}
