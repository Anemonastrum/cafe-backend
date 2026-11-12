import ExcelJS from 'exceljs';
export async function writeWorkbook(rows,columns,stream,signal){
 const workbook=new ExcelJS.stream.xlsx.WorkbookWriter({stream,useStyles:false,useSharedStrings:false}),sheet=workbook.addWorksheet('Report');
 sheet.addRow(columns).commit();for(const [n,row] of rows.entries()){signal?.throwIfAborted();sheet.addRow(columns.map(k=>row[k]==null?'':String(row[k]))).commit();if(n%100===0)await new Promise(resolve=>setImmediate(resolve));}
 sheet.commit();await workbook.commit();
}
