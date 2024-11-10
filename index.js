import express from "express";
import bodyParser from "body-parser";
const app = express();
const port = 3000;

app.use(express.static("public"));
app.set('view engine', 'ejs');
app.set('views', './views');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());


app.get("/", (req, res) => {
    res.render("login.ejs");
});

app.get("/set-password", (req,res) => {
    res.render("set-password.ejs");
});

app.get("/create-password", (req,res) => {
    res.render("create-password.ejs");
})

app.get("/main-page", (req,res) => {
    res.render("home.ejs");
});

app.post("/set-password",(req,res) => {
    res.redirect("/set-password");
});

app.post("/create-password", (req,res) => {
    res.redirect("/create-password");
})

app.post("/main-page", (req,res) => {
    res.redirect("/main-page");
})

app.listen(port, () => {
    console.log(`Listening on port ${port}`);
});