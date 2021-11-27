//*********************************************************************
// SunSystems Connect 
// Open Source - Use with no restrictions
// Version 1.00
//*********************************************************************

var _conf = {
    debug: false,
    debugFileName: "C:\\temp\\debug.txt",
    debugFileNameTurnOn: "C:\\temp\\debugOn.txt",
    fileDefaultFolder: "",
    filename: "",
    businessUnit: "",
    useSsc: true,
    ssc: {
        url: "",
        component: "",
        method: "",
        userName: "",
        userPwd: "",
        token: "",
        contextActive: false,
        headerActive: false
    }
}
var _content = [];

try {
    ProcessContent();

} catch (err) {
    ErrorStatus("ERROR: SSC Runtime: " + err.message);
}

function ProcessContent() {
    if (SetupGet() == false) return; //validation error so bale out

    var wb = context.writebackDataList;

    _content.push('<?xml version="1.0" encoding="UTF-8"?>');
    _content.push('<SSC>');
    XmlTag('<User><Name>{v}</Name></User>', _conf.ssc.userName);
    ProcessSunSystemsContext();
    ProcessHeaders();
    if (context.packet.status.status == true) return; //error

    _content.push('<Payload>');

    for (var r = 0; r < wb.records.Count; r++) {
        XmlGroup(wb.displayList.sqlTableName, false);
        for (var c = 0; c < wb.displayList.items.Count; c++) {
            try {
                var di = wb.displayList.items[c];
                var fi = wb.records[r].fields[c]
                if (di.sqlFieldName.substr(0, 1) == "_") {
                    if (oi.sqlFieldName.indexOf("_CONTEXT_") != -1) continue;
                }
                XmlField(di, fi.value);
            } catch (err) {
                context.packet.status.status = true;
                context.writebackStatusList.message += "Row:" + r + " Col:" + c + " Error:" + err.message + "\r\n";
                return;
            }
        }
        XmlGroup(wb.displayList.sqlTableName, true);
    }
    _content.push('</Payload>');
    _content.push('</SSC>');
    context.writebackStatusList.recordsAffected = wb.records.Count;

    if (_conf.useSsc == true) {
        SscPost(); //Call SSC URL
    } else {
        FileWriteContent(); //Writefile
    }
}

function ProcessSunSystemsContext() {
    //DebugLog("<ProcessSunSystemsContext>");
    _content.push('<SunSystemsContext>');
    XmlTag('<BusinessUnit>{v}</BusinessUnit>', _conf.businessUnit);
    //check for additional context entries
    if (_conf.ssc.contextActive) {
        var options = context.writebackDataList.displayList.Options;
        for (var c = 0; c < options.Count; c++) {
            var oi = options[c];
            if (oi.sqlFieldName.indexOf("_CONTEXT_") != -1) {
                XmlField(oi, lib_data.Replace(lib_data.Format(oi.value), "<null>", ""));
            }
        }
    }
    _content.push('</SunSystemsContext>');
}


function ProcessHeaders() {
    if (!_conf.ssc.headerActive) return;
    //DebugLog("<ProcessHeaders>");
    var options = context.writebackDataList.displayList.Options;
    for (var c = 0; c < options.Count; c++) {
        var oi = options[c];
        if (oi.sqlFieldName.substr(0, 1) != "_") continue;
        if (oi.sqlFieldName.indexOf("_HEADER_") == -1) continue;
        var v = OptionValueListCheck(oi, lib_data.Replace(lib_data.Format(oi.value), "<null>", ""));
        XmlField(oi, v);
    }
}

function SscSecurityTokenGet() {
    // Get the security token
    var url = _conf.ssc.url + "/SecurityProvider";
    var header = {
        "_contentType": "text/xml",
        "soapAction": "http://systemsunion.com/connect/webservices/Authenticate"
    }
    var xml = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>' +
        '<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:w="http://schemas.xmlsoap.org/wsdl/" xmlns:soapenc="http://schemas.xmlsoap.org/soap/encoding/" xmlns:s1="http://microsoft.com/wsdl/types/" xmlns:s="http://www.w3.org/2001/XMLSchema" xmlns:tns="http://systemsunion.com/connect/webservices/" xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" >' +
        '<SOAP-ENV:Body>' +
        '<tns:SecurityProviderAuthenticateRequest xmlns:tns="http://systemsunion.com/connect/webservices/">' +
        '<tns:name>' + lib_data.XmlEncode(_conf.ssc.userName) + '</tns:name>' +
        '<tns:password>' + lib_data.XmlEncode(_conf.ssc.userPwd) + '</tns:password>' +
        '</tns:SecurityProviderAuthenticateRequest>' +
        '</SOAP-ENV:Body>' +
        '</SOAP-ENV:Envelope>';

    var result = "";
    try {
        result = lib_sys.urlContent.Post(url, xml, "text/xml", "", header);
    } catch (err) {
        ErrorStatus("ERROR: SSC server comms on Token Get URL: " + url + " USER: " + _conf.ssc.userName + "\r\nDETAILS: " + err.message);
        return false;
    }
    DebugLog("TOKEN:" + result);
    _conf.ssc.token = lib_data.XmlDecode(lib_data.FindTextBetween(result, '<response>', '</response>', ''));
    if (_conf.ssc.token.length == 0) {
        if (result.indexOf("404") != -1) {
            ErrorStatus("ERROR: 404 SSC authentication failed due to the service being down or the url is invalid.\r\n" + _conf.ssc.url + "\r\nThe SSC url is set in Site Setup / Product Settings / SunSystems");
        } else {
            ErrorStatus("ERROR: SSC authentication failed. Check the SunSystems User ID'" + _conf.ssc.userName + "' and password in either Options or Site Setup / User / SunSystems / User Mapping");
        }
        return false;
    }
    return true;

}

function SscPost() {
    //Post payload to SSC and process response 
    DebugLog("SscPost");

    if (!SscSecurityTokenGet()) return false;

    var url = _conf.ssc.url + "/ComponentExecutor";

    header = {
        "contentType": "text/xml",
        "soapAction": "http://systemsunion.com/connect/webservices/Execute"
    }
    var xml = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>' +
        '<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:w="http://schemas.xmlsoap.org/wsdl/" xmlns:soapenc="http://schemas.xmlsoap.org/soap/encoding/" xmlns:s1="http://microsoft.com/wsdl/types/" xmlns:s="http://www.w3.org/2001/XMLSchema" xmlns:tns="http://systemsunion.com/connect/webservices/" xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" ><SOAP-ENV:Body><tns:ComponentExecutorExecuteRequest xmlns:tns="http://systemsunion.com/connect/webservices/">' +
        "<tns:authentication>" + lib_data.XmlEncode(_conf.ssc.token) + "</tns:authentication>" +
        "<tns:licensing></tns:licensing>" +
        "<tns:component>" + lib_data.XmlEncode(_conf.ssc.component) + "</tns:component>" +
        "<tns:method>" + lib_data.XmlEncode(_conf.ssc.method) + "</tns:method>" +
        "<tns:group></tns:group>" +
        "<tns:payload><![CDATA[" + _content.join("").replace(/\n|\r/g, "") + "]]></tns:payload>" +
        "</tns:ComponentExecutorExecuteRequest></SOAP-ENV:Body></SOAP-ENV:Envelope>"

    //POST data
    var result = "";
    if (_conf.debug) DebugLog("POST DATA:\r\n" + url + "\r\n" + xml);

    try {
        result = lib_sys.urlContent.Post(url, xml, "text/xml", "", header);
    } catch (err) {
        ErrorStatus("ERROR: SSC server comms during Post  URL: " + url + " USER: " + _conf.ssc.userName + "\r\nDETAILS: " + err.message);
        return false;
    }
    if (_conf.debug) DebugLog("POST RESULT:\r\n" + result);

    //response is success or fail
    var response = lib_data.FindTextBetween(result, '<response>', '</response>', '');

    response = lib_data.XmlDecode(response);

    if (response.length == 0) { //low level error
        var faultString = lib_data.FindTextBetween(result, '<faultstring>', '</faultstring>', '');
        if (faultString.length > 0) {
            DebugLog("FaultString:" + faultString);
            //Exception Caught during processing: Debit/Credit marker must be provided (xml tag: DebitCredit)
            if (faultString.indexOf("Debit/Credit marker must be provided") != -1) {
                ErrorStatus("ERROR: SCC Set the Debit/Credit marker in the main list or in the Writeback Options.");
            } else {
                faultString = lib_data.Replace(lib_data.Replace(faultString, "<![CDATA[", ""), "]]>", "");
                ErrorStatus("ERROR: SCC Too many core fields are left blank. Try setting some more fields in Options or the main list\r\n" + faultString);
            }
            return false;
        }
        ErrorStatus("ERROR: SSC check details:\r\n" + result);
        return false;
    }

    DebugLog("RESPONSE:\r\n" + response);

    //SUCCESS
    if (response.indexOf("status='success'") != -1 || response.indexOf('status="success"') != -1) {
        context.writebackStatusList.message = "SUCCESS";
        if (_conf.ssc.component == "Journal") {
            var v = lib_data.FindTextBetween(response, '<JournalNumber>', '</JournalNumber>', '')
            if (v.length > 0) context.writebackStatusList.message = "SUCCESS: Journal Number: " + v + "\r\n";
        } else if (_conf.ssc.component == "SalesOrder") {
            var v = lib_data.FindTextBetween(response, '<SalesOrderTransactionReference>', '</SalesOrderTransactionReference>', '')
            if (v.length > 0) context.writebackStatusList.message = "SUCCESS: Sales Order Trans. Ref.: " + v + "\r\n";
        } else if (_conf.ssc.component == "PurchaseInvoice") {
            var v = lib_data.FindTextBetween(response, '<PurchaseInvoiceTransactionReference>', '</PurchaseInvoiceTransactionReference>', '')
            if (v.length > 0) context.writebackStatusList.message = "SUCCESS: Purchase Invoice Trans. Ref.: " + v + "\r\n";
        }
        return true;
    }
    //FAILED VALIDATION
    if (response.indexOf("status='fail'") != -1 || response.indexOf('status="fail"') != -1) { //FAILED
        var message = "";
        var messageNo = "";
        var currentDataItem = "";
        if (response.indexOf('<Message Level="error"') != -1 || response.indexOf("<Message Level='error'") != -1) {
            //array of messages as seen with multi-row writeback - loop through them making one list
            var mesList = lib_data.FindTextBetween(response, '<Messages>', '</Messages>', '');
            for (var c = 0; c <= 100; c++) {
                var mesItem = lib_data.FindTextBetween(mesList, '<Message ', '</Application>', ''); //dont use closing Message as dup tag inside
                if (mesItem.length == 0) break;
                mesList = lib_data.Replace(mesList, '<Message ' + mesItem + '</Application>', ""); //remove from list
                //ignore Level="warning"
                if (mesItem.indexOf("Level='error'") != -1 || mesItem.indexOf('Level="error"') != -1) {
                    //simple pattern
                    //DebugLog("ERROR[" + c + "]:\r\n" + mesItem);
                    var mesMessage = lib_data.FindTextBetween(mesItem, '<Message>', '</Message>', '');
                    var mesMessageNo = lib_data.FindTextBetween(mesItem, '<MessageNumber>', '</MessageNumber>', '');
                    var mesCurrentDataItem = lib_data.FindTextBetween(mesItem, '<CurrentDataItem>', '</CurrentDataItem>', '');
                    if (mesCurrentDataItem.length == 0) {
                        mesCurrentDataItem = lib_data.FindTextBetween(mesItem, '<DataItem>', '</DataItem>', '');
                    }
                    if (mesMessage.length > 0 && mesMessageNo.length > 0 && mesCurrentDataItem.length > 0) {
                        message += "(" + mesMessageNo + ":" + mesCurrentDataItem + ") " + mesMessage + "\r\n";

                    } else {
                        //second pattern
                        var mesUserText = lib_data.FindTextBetween(mesItem, '<UserText>', '</UserText>', '');
                        var mesComponent = lib_data.FindTextBetween(mesItem, '<Component>', '</Component>', '');
                        var mesType = lib_data.FindTextBetween(mesItem, '<Type>', '</Type>', '');
                        var mesDataItem = lib_data.FindTextBetween(mesItem, '<DataItem>', '</DataItem>', '');
                        if (mesDataItem.length == 0) mesDataItem = mesComponent + ":" + mesType;
                        message += "(" + mesDataItem + ") " + mesUserText + "\r\n";
                    }
                }
            }
            if (message.length > 0) {
                message = lib_data.Replace(lib_data.Replace(lib_data.Replace(lib_data.Replace(message, "        ", " "), "    ", " "), "  ", " "), "  ", " "); //remove huge spaces
                var mesJournalLineNo = lib_data.FindTextBetween(response, '<JournalLineNumber>', '</JournalLineNumber>', '');
                if (mesJournalLineNo.length > 0) mesJournalLineNo = "on Journal Line No: " + mesJournalLineNo + "\r\n";
                ErrorStatus("ERROR: SCC " + mesJournalLineNo + message);
                return false;
            }
        } else {
            //simple message
            message = lib_data.FindTextBetween(response, '<Message>', '</Message>', '')
            messageNo = lib_data.FindTextBetween(response, '<MessageNumber>', '</MessageNumber>', '')
            currentDataItem = lib_data.FindTextBetween(response, '<CurrentDataItem>', '</CurrentDataItem>', '')
            if (message.length == 0) { //differnt type of response (ledger)
                message = lib_data.FindTextBetween(response, '<UserText>', '</UserText>', '')
                if (messageNo.length == 0) {
                    messageNo = lib_data.FindTextBetween(response, '<Type>', '</Type>', '')
                }
                if (currentDataItem.length == 0) {
                    currentDataItem = lib_data.FindTextBetween(response, '<Item>', '</Item>', '')
                }
            }
            if (message.length > 0) {
                message = lib_data.Replace(lib_data.Replace(lib_data.Replace(lib_data.Replace(message, "        ", " "), "    ", " "), "  ", " "), "  ", " "); //remove huge spaces
                if (currentDataItem.length > 0) currentDataItem = ":" + currentDataItem;
                ErrorStatus("ERROR: SSC (" + messageNo + currentDataItem + ") " + message, 1);
                return false;
            }
        }
    }


    ErrorStatus("ERROR: SSC check details:\r\n" + response, 1);
    return false;
}

function SetupGet() {
    //Core Options required to send XML to SSC
    DebugLogDelete();

    var wb = context.writebackDataList.displayList;
    _conf.businessUnit = wb.queryItem.filter.FindCodePathValue("DbC", 0, 0, ""); //Business Unit
    _conf.ssc.component = UrlComponentGet(wb.sqlTableName); //Used by SSC post
    var options = wb.Options;

    for (var c = 0; c < options.Count; c++) {
        var oi = options[c];
        switch (oi.codePath) {
            case "/opSscFileName":
                _conf.filename = lib_data.Replace(lib_data.Format(oi.value), "<null>", "");
                break;
            case "/opSscMenthod":
                _conf.ssc.method = lib_data.Replace(lib_data.Format(oi.value), "<null>", "");
                break;
            case "/opSscUserName":
                _conf.ssc.userName = lib_data.Replace(lib_data.Format(oi.value), "<null>", "");
                if (_conf.ssc.userName.length == 0) {
                    _conf.ssc.userName = oi.sqlFieldName; //User.Map.Code
                }
                break;
            case "/opSscUserPassword":
                _conf.ssc.userPwd = lib_data.Replace(lib_data.Format(oi.value), "<null>", "");
                if (_conf.ssc.userPwd.length == 0) {
                    _conf.ssc.userPwd = oi.sqlFieldName; //User.Map.Password
                }
                break;
            default:
                if (oi.sqlFieldName.indexOf("_CONTEXT_") != -1) {
                    _conf.ssc.contextActive = true;
                } else if (oi.sqlFieldName.indexOf("_HEADER_") != -1) {
                    _conf.ssc.headerActive = true;
                }
        }
    }
    _conf.ssc.url = context.StateValueFind("WbSscUrl", "");
    _conf.fileDefaultFolder = context.StateValueFind("WbSscDefaltFolder", "");
    //debugging
    if (_conf.filename.length == 0) {
        //_conf.filename = "test.xml";
    }
    //append default folder location
    if (_conf.filename.length > 0 && _conf.filename.indexOf("\\") == -1 && _conf.filename.indexOf(":") == -1) {
        if (_conf.fileDefaultFolder.length > 0) _conf.filename = _conf.fileDefaultFolder + "\\" + _conf.filename;
    }
    if (_conf.filename.length > 0) {
        _conf.useSsc = false;
        var folder = lib_sys.io.path.GetDirectoryName(_conf.filename);
        if (!lib_sys.io.directory.Exists(folder)) {
            ErrorStatus("ERROR: SSC Save to file Folder location is invalid or has permissions issues: " + folder + "\r\nThe Folder needs to be accessible to the App Server Windows Service so avoid MyDocuments and Mapped drives but rather use UNC paths.");
            return false;
        }
    }
    if (_conf.useSsc) {
        if (_conf.ssc.url.length == 0) {
            ErrorStatus("ERROR: SSC url is not set. This is set in Site Setup / Product Settings / SunSystems");
            return false;
        }
        if (_conf.ssc.userName.length == 0) {
            ErrorStatus("ERROR: SSC SunSystems User ID and password is not set. Either set in Options or in Site Setup User Mapping");
            return false;
        }
    }
    if (_conf.ssc.userName.length == 0 && _conf.useSsc == false) {
        _conf.ssc.userName = context.userSession.user.code; //use current user as with file it does not matter
    }
    FileDelete();

    DebugLog(JSON.stringify(_conf));
    return true;
}

function ErrorStatus(message, category, row) {
    if (row == undefined || row == null) row = 0;
    if (category == undefined || category == null) category = 3; //1=InvalidValue, 2=Permissions, 3=InternalError 
    if (_conf.debug == true) {
        DebugLog(message);
    }
    context.packet.status.status = true;
    context.writebackStatusList.AddInvalidValue(message, row, category);
}

function DebugLogDelete() {
    try {
        if (_conf.debug != true) {
            if (_conf.debugFileName.length > 0) {
                //turn on debugging by creating a file called "C:\temp\debugOn.txt"
                if (lib_sys.io.file.Exists(_conf.debugFileNameTurnOn)) {
                    _conf.debug = true;
                    lib_sys.io.file.Delete(_conf.debugFileName);
                    return;
                }
            }
            return;
        }
        lib_sys.io.file.Delete(_conf.debugFileName);
    } catch (err) {
        //ignore errors
    }
}

function DebugLog(v) {
    if (_conf.debug != true) return;
    try {
        lib_sys.io.file.AppendAllText(_conf.debugFileName, v + "\r\n");
    } catch (err) {
        //ignore errors
    }
}

function FileDelete() {
    if (_conf.filename.length > 0) {
        try {
            lib_sys.io.file.Delete(_conf.filename)
        } catch (err) {

        }
    }
}

function FileWriteContent() {
    if (_conf.filename.length > 0) {
        try {
            lib_sys.io.file.WriteAllText(_conf.filename, _content.join('\n'));
        } catch (err) {
            ErrorStatus("ERROR: SSC Write to XML to file failed '" + _conf.filename + "\r\n" + err.message, 2);
        }
    }
}

function UrlComponentGet(s) {
    //[Journal]/[Ledger]
    if (s.indexOf("/[") != -1) {
        //table uses different component tag to url method  get [Journal] part
        return lib_data.FindTextBetween(s, '[', ']', '').trim();
    } else {
        return lib_data.Replace(lib_data.Replace(s, "[", ""), "]", "").trim()
    }
}

function XmlGroup(s, closeTag) {
    //[Journal]/[Ledger]
    if (s.indexOf("/[") != -1) {
        //table uses different component tag to url method  get [Ledger] part
        s = "[" + lib_data.FindTextBetween(s, '/[', ']', '').trim() + "]";
    }
    if (s.substr(0, 1) == "[") { //SQL format [c]
        var xmlTag = lib_data.Replace(lib_data.Replace(s, "[", ""), "]", "");
        if (closeTag) s = "</" + xmlTag + ">";
        else s = "<" + xmlTag + ">";
    } else { //Raw XML syntax </c>
        if (closeTag) s = lib_data.Replace(s, "<", "</");
    }
    _content.push(s);
}

function XmlTag(s, v) {
    _content.push(lib_data.Replace(s, "{v}", lib_data.XmlEncode(v)));
}

function OptionValueListCheck(di, v) { //options don't validate or map value lists so must do it ourselfs
    if (v == null || v == "" || v == "<ALL>" || v == "<blank>") return "";
    if (di.lookupValueList == null || di.lookupValueList.items.Count == 0) return v;
    var found = null;
    for (var c = 0; c < di.lookupValueList.items.Count; c++) {
        var i = di.lookupValueList.items[c];
        if (i.code == "<ALL>") continue;
        if (v.toUpperCase() == i.code.toUpperCase() || v.toUpperCase() == i.description.toUpperCase()) {
            //DebugLog("VL" + i.code + "/ " + i.description);
            return i.code;
        }
    }
    var validValues = "";
    for (var c = 0; c < di.lookupValueList.items.Count; c++) {
        var i = di.lookupValueList.items[c];
        if (i.code == "<ALL>") continue;
        if (validValues.length > 0) validValues += ", ";
        validValues += i.code + "=" + i.description;
    }
    ErrorStatus("Invalid Options value '" + v + "' on field '" + di.description + "'\r\n" + validValues, 1);

    return v;
}

function XmlField(di, v) {
    var xmlSec = di.sqlFieldName;

    if (v == null || v == "" || v == "<null>") {
        //don't save empty nodes
        if (xmlSec.substr(0, 1) == "[") return;
        if (xmlSec.indexOf("[") != -1) return;
        if (xmlSec.indexOf("{v}") != -1) return;
    }
    var dataType = di.DataTypeGet();
    if (dataType == "Period" || di.codePath == "/DefaultPeriod") {
        v = ConvertPeriod(v);
    } else if (dataType == "Date") {
        v = ConvertDate(v);
    } else if (dataType == "DateTime") {
        v = ConvertDateTime(v);
    } else if (dataType == "Decimal" || dataType == "Integer" || dataType == "Currency" || dataType == "Percentage") {
        v = ConvertDecimal(v);
    } else {
        if (v == "<null>") v = "";
    }
    if (v == "!") {
        v = ""; //special set to blank symbol
    }
    if (xmlSec.substr(0, 1) == "_") {
        if (xmlSec.indexOf("_HEADER_") != -1) {
            xmlSec = lib_data.Replace(xmlSec, "_HEADER_", "")
        } else if (xmlSec.indexOf("_CONTEXT_") != -1) {
            xmlSec = lib_data.Replace(xmlSec, "_CONTEXT_", "")
        }
    }
    if (xmlSec.substr(0, 1) == "[") { //SQL format [c] => <c>{v}</c>
        xmlSec = lib_data.Replace(lib_data.Replace(xmlSec, "[", ""), "]", "");
        xmlSec = "<" + xmlSec + ">" + lib_data.XmlEncode(v) + "</" + xmlSec + ">";
        _content.push(xmlSec);
    } else {
        if (xmlSec.indexOf("{v}") != -1) { //Raw XML syntax <c>{v}</c>
            _content.push(lib_data.Replace(xmlSec, "{v}", lib_data.XmlEncode(v)));
        } else {
            _content.push(xmlSec);
        }
    }
}

function ConvertPeriod(v) { //PPPYYYY
    if (v == null || v == "" || v == "0" || v == "<null>" || v == 0) return "0000000";
    if (v.toString().toUpperCase() == "PERIOD") {
        v = lib_data.Format('yyyy-MM', lib_data.Now())
    }
    v = lib_data.SqlNum(lib_data.ValPeriod(v));
    return v.substr(4, 3) + v.substr(0, 4);
}

function ConvertDate(v) { //DDMMYYYYY
    v = lib_data.SqlDate(lib_data.ValDate(v, true, "en-GB")) //'2018-08-23'
    return v.substr(9, 2) + v.substr(6, 2) + v.substr(1, 4) //23082018
}

function ConvertDateTime(v) { //DDMMYYYYYHHmmss
    return lib_data.Format('yyyyMMddHHmmss', lib_data.ValDate(v, true, "en-GB"))
}

function ConvertDecimal(v) {
    if (v == "<null>") v = "0";
    return lib_data.SqlNum(lib_data.ValDecimal(v))
}