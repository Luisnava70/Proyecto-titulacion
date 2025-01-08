import express, { query } from "express";
import bodyParser from "body-parser";
import env from "dotenv";
import pg from "pg";
import bcrypt from "bcrypt";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy} from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth2";
import  emailHelper  from "./emailHelper.js";
import multer from "multer";
import fs from "node:fs";
import path from "path";


const app = express();
const port = 3000;

app.use(express.static("public"));
app.set('view engine', 'ejs');
app.set('views', './views');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({ secret: "devBurrito&85", resave: false, saveUninitialized: false , cookie: {
  maxAge:1000 * 60 * 60 * 24,
}}));

app.use(passport.initialize());
app.use(passport.session());

env.config();
const userSessions = {};
let currentModule = 1;
const saltRounds = 10;
let currentModuleRoute = "/";
let verificationCode = "";



const db = new pg.Client({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT,
});

db.connect();

passport.use(
    new LocalStrategy({ usernameField: 'email' },async function verify(email, password, cb) {
        console.log("Correo recibido:", email);
        console.log("Contraseña recibida:", password);

    try {
        const result = await db.query("SELECT * FROM user_credentials WHERE email = $1", [
            email,
        ]);
        console.log(result.rows[0]);
        if (result.rows.length > 0) {
            const user = result.rows[0];
            const storedHashedPassword = user.password;
            bcrypt.compare(password, storedHashedPassword, (err, result) => {
                if (err) {
                    console.error("Error logging in user:", err);
                    return cb(err);
                } else {
                    if (result) {
                        return cb(null, user);
                    } else {
                        console.log("Contraseña incorrecta");
                        return cb(null, false);
                    }
                }
            });
        } else {
            console.log("Usuario no encontrado");
            return cb("user not found");
        }
    } catch (err) {
        return cb(err);
    }
}));

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/main-page",
    userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
}, async function(accessToken, refreshToken, profile, cb) {
    console.log("Google profile:", profile);
    try {
        const result = await db.query("SELECT * FROM user_credentials WHERE email = $1", [
            profile.email,
        ]);
        if (result.rows.length > 0) {
            const user = result.rows[0];
            return cb(null, user);
        }else{
            await insertNewUser(profile.email,profile.id);
            const result = await db.query("SELECT * FROM user_credentials WHERE email = $1", [
                profile.email,
            ]);
            const user = result.rows[0];
            return cb(null, user);
        }
        
    } catch (err) {
        return cb(err);
    }
}));


passport.serializeUser(function (user, cb) {
    cb(null, user.user_id);
});
passport.deserializeUser(async (user_id, cb) => {
    try {
        const result = await db.query("SELECT * FROM user_credentials WHERE user_id = $1", [user_id]);
        cb(null, result.rows[0]);
    } catch (err) {
        cb(err);
    }
});

const upload = multer({ dest: 'public/images/user-img-profile/' });


app.get("/", (req, res) => {
    res.render("login.ejs");
});

app.get("/set-password", (req,res) => {
    console.log(req.query.incorrectPassword);
    
    res.render("set-password.ejs",
        {
            email: req.query.email,
            incorrectPassword: req.query.incorrectPassword === "true"
        }
    );
});

app.get("/create-password", (req,res) => {
    res.render("create-password.ejs",
        {
            email: req.query.email,
            incorrectPassword: req.query.incorrectPassword === "true"
        }
    );
});

app.get("/forgot-password", async (req,res) => {
    res.render("forgot-password.ejs",);
})

app.get("/verification-code", async (req,res) => {
    res.render("verificationCode.ejs",
        {
            email: req.query.email,
            verificationCode: req.query.incorrectCode === "true"
        }
    );
})

app.get("/reset-password", async(req,res) => {
    res.render("reset-password.ejs",
        {
            email: req.query.email,
            isIncorrectPassword: req.query.incorrectPassword === "true"
        }
    );
})

app.get("/main-page", async (req,res) => {
    console.log("Main page");
    
    const userId = req.user.user_id;
    
    const isCompleteRazonamientoLogico = await isUserCompletedModule(userId,1);
    const isCompleteRazonamientoMat = await isUserCompletedModule(userId,2);
    const isCompleteVariables = await isUserCompletedModule(userId,3);
    const isCompleteStrings = await isUserCompletedModule(userId,4);
    const isCompleteNumbAndBooleans = await isUserCompletedModule(userId,5);
    const isCompleteOperators = await isUserCompletedModule(userId,6);
    const isCompleteControlStructures = await isUserCompletedModule(userId,7);
    const isCompleteArrays = await isUserCompletedModule(userId,8);
    console.log(isCompleteRazonamientoLogico);
    if(req.isAuthenticated()){
        res.render("home.ejs",{
            isCompleteRazonamientoLogico: isCompleteRazonamientoLogico,
            isCompleteRazonamientoMat: isCompleteRazonamientoMat,
            isCompleteVariables: isCompleteVariables,
            isCompleteStrings: isCompleteStrings,
            isCompleteNumbAndBooleans: isCompleteNumbAndBooleans,
            isCompleteOperators: isCompleteOperators,
            isCompleteControlStructures: isCompleteControlStructures,
            isCompleteArrays: isCompleteArrays
        });
    }else{
        res.redirect("/");
    }
});

app.get('/flash-cards', (req, res) => {
    res.render('flashCards.ejs');
});

app.get("/logout", (req, res) => {
    req.logout(function (err) {
        if (err) {
            return next(err);
        }
        res.redirect("/");
    });
});

app.get("/user-profile", async(req,res) => {
    console.log(req.user);
    const userId = req.user.user_id;
    const modulesApproved = await getModulesApprovedByUser(userId);
    const user = await getUserData(userId);
    const userName = user.nickname;
    const userPhoto = user.profile_picture;
    console.log(userName, userPhoto);
    
    res.render("user-profile.ejs",
        {
            userName: userName,
            userPhoto: userPhoto,
            userEmail: req.user.email,
            modulesApproved: modulesApproved
        }
    );
});

app.get("/user-config", async(req,res) => {
    const user = await getUserData(req.user.user_id);
    
    res.render("user-config.ejs", {
        userName: user.nickname,
    });
})

app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));
app.get("/auth/google/main-page", passport.authenticate("google", { failureRedirect: "/" }), (req, res) => {
    res.redirect("/main-page");
});

app.get("/razonamiento-logico", async (req,res) => {
    console.log("Req.user: " + req.user);
    console.log(req.isAuthenticated());
    currentModule = 1;
    const userId = "guest";
    currentModuleRoute = "/razonamiento-logico";

    if(!userSessions[userId]){
        const question = await questionsPerModule(currentModule);
        const shuffledQuestions = shuffleQuestions(question)

        userSessions[userId] = {
            questions: shuffledQuestions,
            currentQuestion: 0,
            score: 0,
            poorlyAnsweredQuestions: [],
            progress: 0,
            currentModuleUser: currentModule
        };
    }
    
    
    const sessionData = userSessions[userId];
    const currentQuestion = sessionData.questions[sessionData.currentQuestion];
    const options = await optionsPerQuestion(currentQuestion.question_id);

    res.render("module1.ejs",{
        question: currentQuestion,
        options: options,
        progress: userSessions[userId].progress
    });
});

app.get("/razonamiento-matematico", async (req,res) => {
    console.log(req.user);
    console.log(req.isAuthenticated());
    const userId = "guest";
    currentModule = 2;
    currentModuleRoute = "/razonamiento-matematico";

    if(!userSessions[userId]){
        const question = await questionsPerModule(currentModule);
        const shuffledQuestions = shuffleQuestions(question)

        userSessions[userId] = {
            questions: shuffledQuestions,
            currentQuestion: 0,
            score: 0,
            poorlyAnsweredQuestions: [],
            progress: 0,
            currentModuleUser: currentModule
        };
    }
    
    
    const sessionData = userSessions[userId];
    const currentQuestion = sessionData.questions[sessionData.currentQuestion];
    const options = await optionsPerQuestion(currentQuestion.question_id);

    res.render("module1.ejs",{
        question: currentQuestion,
        options: options,
        progress: userSessions[userId].progress
    });
});

app.get("/varianles-modules", async (req,res) => {
    console.log(req.user);
    console.log(req.isAuthenticated());
    const userId = "guest";
    currentModule = 3;
    currentModuleRoute = "/varianles-modules";

    if(!userSessions[userId]){
        const question = await questionsPerModule(currentModule);

        const shuffledQuestions = shuffleQuestions(question)

        userSessions[userId] = {
            questions: shuffledQuestions,
            currentQuestion: 0,
            score: 0,
            poorlyAnsweredQuestions: [],
            progress: 0,
            currentModuleUser: currentModule
        };
    }
    
    
    const sessionData = userSessions[userId];
    const currentQuestion = sessionData.questions[sessionData.currentQuestion];
    const options = await optionsPerQuestion(currentQuestion.question_id);
    console.log("si contiene \\n", currentQuestion.question_text.includes('\\n'));
    
    res.render("js-modules.ejs",{
        question: currentQuestion,
        options: options,
        progress: userSessions[userId].progress
    });
})

app.get("/string-module", async (req,res) => {
    console.log(req.user);
    console.log(req.isAuthenticated());
    const userId = "guest";
    currentModule = 4;
    currentModuleRoute = "/string-module";

    if(!userSessions[userId]){
        const question = await questionsPerModule(currentModule);

        const shuffledQuestions = shuffleQuestions(question)

        userSessions[userId] = {
            questions: shuffledQuestions,
            currentQuestion: 0,
            score: 0,
            poorlyAnsweredQuestions: [],
            progress: 0,
            currentModuleUser: currentModule
        };
    }
    
    
    const sessionData = userSessions[userId];
    const currentQuestion = sessionData.questions[sessionData.currentQuestion];
    const options = await optionsPerQuestion(currentQuestion.question_id);
    console.log("si contiene \\n", currentQuestion.question_text.includes('\\n'));
    
    res.render("js-modules.ejs",{
        question: currentQuestion,
        options: options,
        progress: userSessions[userId].progress
    });
})

app.get("/numb-booleans-module", async (req,res) => {
    console.log(req.user);
    console.log(req.isAuthenticated());
    const userId = "guest";
    currentModule = 5;
    currentModuleRoute = "/numb-booleans-module";

    if(!userSessions[userId]){
        const question = await questionsPerModule(currentModule);

        const shuffledQuestions = shuffleQuestions(question)

        userSessions[userId] = {
            questions: shuffledQuestions,
            currentQuestion: 0,
            score: 0,
            poorlyAnsweredQuestions: [],
            progress: 0,
            currentModuleUser: currentModule
        };
    }
    
    
    const sessionData = userSessions[userId];
    const currentQuestion = sessionData.questions[sessionData.currentQuestion];
    const options = await optionsPerQuestion(currentQuestion.question_id);
    console.log("si contiene \\n", currentQuestion.question_text.includes('\\n'));
    
    res.render("js-modules.ejs",{
        question: currentQuestion,
        options: options,
        progress: userSessions[userId].progress
    });
})


app.get("/operators-module", async (req,res) => {
    console.log(req.user);
    console.log(req.isAuthenticated());
    const userId = "guest";
    currentModule = 6;
    currentModuleRoute = "/operators-module";

    if(!userSessions[userId]){
        const question = await questionsPerModule(currentModule);

        const shuffledQuestions = shuffleQuestions(question)

        userSessions[userId] = {
            questions: shuffledQuestions,
            currentQuestion: 0,
            score: 0,
            poorlyAnsweredQuestions: [],
            progress: 0,
            currentModuleUser: currentModule
        };
    }
    
    
    const sessionData = userSessions[userId];
    const currentQuestion = sessionData.questions[sessionData.currentQuestion];
    const options = await optionsPerQuestion(currentQuestion.question_id);
    console.log("si contiene \\n", currentQuestion.question_text.includes('\\n'));
    
    res.render("js-modules.ejs",{
        question: currentQuestion,
        options: options,
        progress: userSessions[userId].progress
    });
})

app.get("/control-structures", async (req,res) => {
    console.log(req.user);
    console.log(req.isAuthenticated());
    const userId = "guest";
    currentModule = 7;
    currentModuleRoute = "/control-structures";

    if(!userSessions[userId]){
        const question = await questionsPerModule(currentModule);

        const shuffledQuestions = shuffleQuestions(question)

        userSessions[userId] = {
            questions: shuffledQuestions,
            currentQuestion: 0,
            score: 0,
            poorlyAnsweredQuestions: [],
            progress: 0,
            currentModuleUser: currentModule
        };
    }
    
    
    const sessionData = userSessions[userId];
    const currentQuestion = sessionData.questions[sessionData.currentQuestion];
    const options = await optionsPerQuestion(currentQuestion.question_id);
    console.log("si contiene \\n", currentQuestion.question_text.includes('\\n'));
    
    res.render("js-modules.ejs",{
        question: currentQuestion,
        options: options,
        progress: userSessions[userId].progress
    });
})

app.get("/arrays-module", async (req,res) => {
    console.log(req.user);
    console.log(req.isAuthenticated());
    const userId = "guest";
    currentModule = 8;
    currentModuleRoute = "/arrays-module";

    if(!userSessions[userId]){
        const question = await questionsPerModule(currentModule);

        const shuffledQuestions = shuffleQuestions(question)

        userSessions[userId] = {
            questions: shuffledQuestions,
            currentQuestion: 0,
            score: 0,
            poorlyAnsweredQuestions: [],
            progress: 0,
            currentModuleUser: currentModule
        };
    }
    
    
    const sessionData = userSessions[userId];
    const currentQuestion = sessionData.questions[sessionData.currentQuestion];
    const options = await optionsPerQuestion(currentQuestion.question_id);
    console.log("si contiene \\n", currentQuestion.question_text.includes('\\n'));
    
    res.render("js-modules.ejs",{
        question: currentQuestion,
        options: options,
        progress: userSessions[userId].progress
    });
})

app.get('/result-module', async (req, res) => {

    const userId = "guest";
    const sessionData = userSessions[userId];

    const questionAndAnswer = await Promise.all(
        sessionData.poorlyAnsweredQuestions.map(async (question) => {
            return await getQuestionAndAnswer(question.question_id);
        })
    );
    /* console.log(userSessions[userId].questions) */;
    const message = sessionData.score > 6
        ? "¡Avanzas al siguiente nivel!"
        : "Debes mejorar tus habilidades en este módulo";
        /* console.log(sessionData); */
    if(sessionData.score > 6){
        await updateUserProgress(req.user.user_id,sessionData.currentModuleUser);
    }
    const scoreUser = sessionData.score;
    userSessions[userId] = null;
    await resetQuestion();
        
    const flatArray = questionAndAnswer.flat();
    res.render('result.ejs', {
        questionAndAnswer: flatArray,
        finalScore: scoreUser,
        message: message
    });
});

app.post("/set-email", async (req, res) => {
    console.log(req.body);
    const email = req.body.email;
    if(await isAlreadyExistsUser(email)){
        res.redirect(`/set-password?email=${email}`);
    }else {
        console.log("Aun no existe el usuario");
        res.redirect(`/create-password?email=${email}`);
    }
});

app.post("/set-password", (req, res, next) => {
    const email = req.body.email; // Asegúrate de que el email venga en el body
    passport.authenticate("local", {
        successRedirect: "/main-page",
        failureRedirect: `/set-password?email=${email}&incorrectPassword=true` 
    })(req, res, next);
});

app.post("/create-password", async (req,res) => {
    console.log(req.body);
    const {email,password,confirm_password} = req.body;
    try{
        if(password === confirm_password){
            bcrypt.hash(password,saltRounds,async (err,hash) => {
                    if(err){
                        console.log(err);
                    }else{
                        const result = await insertNewUser(email,hash)
                        console.log(result);
                        const user = result;
                        req.login(user, (err) => {
                            if (err) {
                                return res.status(400).send({ message: err });
                            } else {
                                res.redirect("/main-page");
                            }
                        });
                    }
                })
        }else{
            console.log("Las contraseñas no coinciden");
            res.redirect(`/create-password?email=${email}&incorrectPassword=true`);
        }
    }catch(err){
        console.log(err);
    }
})

app.post("/main-page", (req,res) => {
    res.redirect("/main-page");
})

app.post("/forgot-password", async (req,res) => {
    
    verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const email = req.body.email;
    const subject = "Código de verificación";
    const text = "Tu código de verificación es: " + verificationCode;
    
    try {
        await emailHelper(email, subject, text);
        res.redirect("/verification-code?email=" + email);
    } catch (err) {
        console.error("Error al enviar el correo:", err);
        res.redirect("/forgot-password?error=true");
    }
})

app.post("/verification-code", async(req,res) => {
    console.log(req.body);
    
    const {email,codeVerification} = req.body;
    if(codeVerification === verificationCode){
        res.redirect("/reset-password?email="+email);
    }else{
        res.redirect("/verification-code?email="+email + "&incorrectCode=true");
    }
})

app.post("/reset-password", async(req,res) => {
    const email = req.body.email;
    const password = req.body.password;
    const confirm_password = req.body.confirm_password;
    if(password === confirm_password){
        bcrypt.hash(password,saltRounds,async (err,hash) => {
            if(err){
                console.log(err);
            }else{
                await resetPassword(email,hash);
                res.redirect("/");
            }
        })
    }else{
        res.redirect("/reset-password?email="+email+"&incorrectPassword=true");
    }
})

app.post('/next-question', async (req, res) => {

    const userId = "guest";
    const sessionData = userSessions[userId];
    const currentQuestionData = sessionData.questions[sessionData.currentQuestion];
    const totalQuestions = sessionData.questions.length;

    const { questionId, selectedOption } = req.body;
    /* console.log(`Pregunta ID: ${questionId}, Opción seleccionada: ${selectedOption}`); */
    /* console.log(req.body); */
    
    const correctAnswer = await isCorrectAnswer(selectedOption,questionId);

    if(!correctAnswer){
        sessionData.poorlyAnsweredQuestions.push(currentQuestionData)
        /* console.log("preguntas mal contestadas",poorlyAnsweredQuestions); */
    }else{
        sessionData.score++;
        sessionData.progress = Math.min(100, sessionData.progress + (100 / totalQuestions));;
    }

    sessionData.currentQuestion++;
    if(sessionData.currentQuestion >= sessionData.questions.length){
        res.redirect("/result-module")
    }else{
        res.redirect(currentModuleRoute);
    }
})

app.post('/update-profile',upload.single('profilePhoto') ,async (req, res) => {
    try{
        const imgRecived = req.file;
        const newName = req.body.newUserName;
        const newPicture = saveImg(imgRecived);
        console.log(newPicture, newName);
        
        await updateUser(newName,newPicture,req.user.user_id);
        res.redirect("/user-profile");
        
    }catch(err){
        console.log(err);
    }
})

function saveImg(fileImg){
    const newPath = `public/images/user-img-profile/${fileImg.originalname}`;
    fs.renameSync(fileImg.path, newPath);
    return newPath;
}

async function updateUser(newName,newPicture,user_id) {
    try{
        const result = await db.query("UPDATE users SET nickname = $1, profile_picture = $2 WHERE user_id = $3", [
            newName,newPicture,user_id
        ]);
    }catch(err){
        console.log(err);
    }
}

async function getUserData(user_id) {
    try{
        const result = await db.query("SELECT * FROM users WHERE user_id = $1", [
            user_id
        ]);
        return result.rows[0];
    }catch(err){
        console.log(err);
    }
}

async function isAlreadyExistsUser(email) {
    try{
        const result = await db.query("SELECT * FROM user_credentials WHERE email = $1", [
            email
        ]);
        return result.rows.length > 0;
    }catch(err){
        console.log(err);
    }
}

async function insertNewUser(email,password) {
    try{
        const tbaleUser = await db.query("INSERT INTO users (nickname) VALUES ($1) RETURNING user_id", [email]);
        const userId = tbaleUser.rows[0].user_id; // Recupera el user_id generado

        // Inserta en la tabla user_credentials con el user_id
        const result = await db.query(
            "INSERT INTO user_credentials (user_id, email, password) VALUES ($1, $2, $3) RETURNING *", 
            [userId, email, password]
        );
        await insertParamsOnUser_progressTable(userId);
        return result.rows[0];
    }catch(err){
                console.log(err);
        }
    
}

function shuffleQuestions(questions) {
    for (let i = questions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [questions[i], questions[j]] = [questions[j], questions[i]];
    }
    return questions;
}

async function questionsPerModule(moduleNumber) {
    let questions = [];
    try{
        const randomQuestions = getRandomQuestions(moduleNumber);
        const result = await db.query("SELECT * FROM questions WHERE module_id = $1 AND is_used = true",[
            moduleNumber
        ])
        questions = result.rows;
        return questions;
    }catch(err){
        console.log(err);
    }
}

async function getRandomQuestions(moduleNumber) {
    try {
        const result = await db.query(`UPDATE questions
                                        SET is_used = TRUE
                                        WHERE question_id IN (
                                            SELECT question_id
                                            FROM questions
                                            WHERE is_used = FALSE
                                            AND module_id = $1
                                            ORDER BY RANDOM()
                                            LIMIT 8);`, [moduleNumber]);
        return result; 
    } catch (err) {
        console.error('Error obteniendo preguntas:', err);
        throw err;
    }
}

async function optionsPerQuestion(questionNumber) {
    let options = [];
    try{
        const result = await db.query("SELECT * FROM options WHERE question_id = $1", [
            questionNumber
            ])
            options = result.rows;
            return options;
    }catch(err){
        console.log(err);
    }
}


async function isCorrectAnswer(answerIdSelected,questionNumber) {
    try{
        const type = await typeQuestion(questionNumber);
        const answerForTypeText = await getQuestionAndAnswer(questionNumber);
        const result = await db.query("SELECT * FROM answers WHERE question_id = $1", [
            questionNumber
            ]);
        const answerOfQuestion = result.rows[0];
        console.log(answerOfQuestion)
        console.log(typeof answerForTypeText[0].answer_text);
        
        
        if(type.type == "write"){
            if (answerForTypeText[0] && typeof answerForTypeText[0].answer_text === "string") {
                return answerForTypeText[0].answer_text.includes(answerIdSelected);
            } else {
                console.error("answer_text no es válido:", answerForTypeText);
                return false; // Retorna un valor por defecto si no es válido
            }
        }else{
            return answerIdSelected == answerOfQuestion.option_id;
        }
        
        
    }catch(err){
        console.log(err);
    }
}

async function typeQuestion(questionNumber) {
    const result = await db.query(`
        SELECT type FROM questions WHERE question_id = $1`, 
        [questionNumber]);
        return result.rows[0];
}

async function getQuestionAndAnswer(questionNumber) {
    try{
        const result = await db.query(
            `SELECT 
                q.question_text, 
                o.option_text AS answer_text
            FROM 
                questions q
            JOIN 
                answers a
            ON 
                q.question_id = a.question_id
            JOIN 
                options o
            ON 
                a.option_id = o.option_id
            WHERE 
                q.question_id = $1;`, 
            [questionNumber]);
        return result.rows;
    }catch(err){
        console.log(err);
    }
}

async function resetQuestion() {
    try{
        const result = await db.query( `UPDATE questions
                                        set is_used = false
                                        where is_used = true;`);
    }catch(err){
        console.log(err);
    }
}

async function insertParamsOnUser_progressTable(user_id) {
    try{
        for (let i = 1; i <= 8; i++) {
            const result = await db.query(`INSERT INTO user_progress 
                (user_id,module_id,status,correct_answers,completed_at) VALUES ($1,$2,'Incomplete',0,null);`, [user_id, i]);
        }
        console.log("Se insertaron los datos en la tabla user_progress");
        
    }catch(err){
        console.log(err);
    }
}

async function isUserCompletedModule(user_id,module_id) {
    try{
        const result = await db.query("SELECT * FROM user_progress WHERE user_id = $1 AND module_id = $2", [
            user_id, module_id]);
            console.log(result.rows[0].status);
        return result.rows[0].status == "Complete";

    }catch(err){
        console.log(err);
    }

}

async function updateUserProgress(user_id,module_id) {
    console.log(`Se acutaliza el modulo ${module_id} del usuario ${user_id}`);
    
    try{
        const result = await db.query("UPDATE user_progress SET status = 'Complete' WHERE user_id = $1 AND module_id = $2", [
            user_id, module_id]);
    }catch(err){
        console.log(err);
    }
}

async function getModulesApprovedByUser(user_id) {
    try{
        const result = await db.query(`SELECT m.module_name AS module_name
                                        FROM user_progress up
                                        JOIN modules m ON up.module_id = m.module_id
                                        WHERE up.user_id = $1 AND up.status = 'Complete';`, [
            user_id
        ]);
        return result.rows;
    }catch(err){
        console.log(err);
    }
    
}

async function resetPassword(email,password) {
    try{
        const result = await db.query("UPDATE user_credentials SET password = $1 WHERE email = $2", [
            password, email]);
    }catch(err){
        console.log(err);
    }
}





app.listen(port, () => {
    console.log(`Listening on port ${port}`);
});